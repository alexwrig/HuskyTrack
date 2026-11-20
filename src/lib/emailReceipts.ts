// Email receipt ingestion.
//
// Receipt emails are forwarded from the user's UW mailbox (an Outlook inbox
// rule) to the AgentMail receipts inbox. Each one is parsed with Claude and
// either added as a receipt or, when parsing is unsure, sent to Needs Review.
// Two ways in:
//   - the AgentMail webhook (app/api/inbound-email), as mail arrives, when
//     auto-parse is on; with it off the email is only listed as waiting;
//   - "Check inbox" (app/api/email-receipts/check), which picks up anything
//     not yet parsed, including mail that arrived while auto-parse was off.
// Both claim a message id in processed_email_messages first, so an email is
// only ever parsed once.

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import type { AgentMailClient } from 'agentmail'
import { getAgentMailClient, fetchAttachmentBase64, RECEIPTS_INBOX } from './agentmail'
import { parseReceiptFile, parseReceiptEmailText } from '../legacy/receiptOcr'
import {
  createReceipt, createReviewItem, claimMessageId, ensureTable,
  getSetting, setSetting, upsertEmailReceipt, getEmailReceiptStatuses,
} from './db'
import { EXPENSE_CATEGORIES } from '../types'
import type { ReceiptCreate, ParsedReceiptFields, EmailReceipt } from '../types'

const RECEIPT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const CONFIDENCE_THRESHOLD = 0.7

const AUTO_PARSE_KEY = 'email_auto_parse'
const LAST_CHECKED_KEY = 'email_last_checked_at'

export async function getAutoParse(): Promise<boolean> {
  // On unless explicitly turned off.
  return (await getSetting(AUTO_PARSE_KEY)) !== 'false'
}

export async function setAutoParse(on: boolean): Promise<void> {
  await setSetting(AUTO_PARSE_KEY, on ? 'true' : 'false')
}

export async function getLastCheckedAt(): Promise<string | null> {
  return getSetting(LAST_CHECKED_KEY)
}

async function markChecked(): Promise<void> {
  await setSetting(LAST_CHECKED_KEY, new Date().toISOString())
}

// AgentMail's SDK types (camelCase) describe values returned by SDK calls,
// which go through its response deserializer. A raw webhook body is wire
// JSON (snake_case) and is never deserialized by the SDK, so it needs its
// own shape here rather than reusing e.g. AgentMail.MessageReceivedEvent.
// The webhook payload's inline message fields (text/html/attachments) are
// not reliable -- observed empty on a real forwarded email even though the
// content exists -- so only the identifiers are read from it; the full
// message is always re-fetched via the API below.
interface InboundWebhookEvent {
  type: 'event'
  event_type: string
  event_id: string
  message: { inbox_id: string; message_id: string }
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const EMPTY_PARSED: ParsedReceiptFields = {
  date: null, merchant: null, amount: null,
  suggested_category: null, suggested_purpose: null,
  suggested_description: null, card_last_four: null,
  city: null, state: null, confidence: null,
}

function toReceiptCreate(parsed: ParsedReceiptFields): ReceiptCreate {
  return {
    date:           parsed.date ?? new Date().toISOString().slice(0, 10),
    merchant:       parsed.merchant ?? 'Unknown',
    amount:         parsed.amount ?? 0,
    category:       parsed.suggested_category ?? 'Other',
    purpose_sub:    parsed.suggested_purpose ?? null,
    purpose:        parsed.suggested_description ?? null,
    card_last_four: null,
    card_name:      null,
    city:           parsed.city ?? null,
    state:          parsed.state ?? null,
  }
}

function isUsable(parsed: ParsedReceiptFields): { ok: true } | { ok: false; reason: string } {
  if (parsed.merchant == null || parsed.amount == null || parsed.date == null) {
    return { ok: false, reason: 'Missing required field (merchant, amount, or date)' }
  }
  if (parsed.suggested_category && !(EXPENSE_CATEGORIES as readonly string[]).includes(parsed.suggested_category)) {
    return { ok: false, reason: `Unrecognized category: ${parsed.suggested_category}` }
  }
  if (parsed.confidence != null && parsed.confidence < CONFIDENCE_THRESHOLD) {
    return { ok: false, reason: `Low confidence (${parsed.confidence})` }
  }
  return { ok: true }
}

// Tally of what one email produced, for its row in the inbox panel.
interface Tally {
  created: number
  reviewed: number
  amount: number
  merchant: string | null
  date: string | null
  reason: string | null
}

async function handleParsedResult(
  tally: Tally,
  parsed: ParsedReceiptFields,
  reasonIfFailed: string | undefined,
  common: {
    fromAddress: string | null
    subject: string | null
    fileName: string | null
    mimeType: string | null
    fileBase64: string | null
    emailText: string | null
  },
  forceReview: string | undefined,
): Promise<void> {
  tally.merchant ??= parsed.merchant
  tally.date ??= parsed.date
  const usable = isUsable(parsed)
  if (usable.ok && !reasonIfFailed && !forceReview) {
    const receipt = await createReceipt(toReceiptCreate(parsed), 'Email (auto)')
    tally.created += 1
    tally.amount += receipt.amount
    return
  }
  const reason = reasonIfFailed ?? forceReview ?? (usable.ok ? 'Unknown' : usable.reason)
  tally.reviewed += 1
  tally.reason ??= reason
  await createReviewItem({
    from_address: common.fromAddress,
    subject:      common.subject,
    file_name:    common.fileName,
    mime_type:    common.mimeType,
    file_base64:  common.fileBase64,
    email_text:   common.emailText,
    parsed,
    reason,
  })
}

// Parses one already-claimed message into receipts / review items and
// records the outcome for the inbox panel. Never throws: any failure lands
// in Needs Review, since the message is claimed and won't be retried.
async function parseMessage(client: AgentMailClient, inboxId: string, messageId: string, isSpam: boolean): Promise<EmailReceipt> {
  const tally: Tally = { created: 0, reviewed: 0, amount: 0, merchant: null, date: null, reason: null }
  const forceReview = isSpam ? 'Flagged as spam by AgentMail' : undefined
  let fromAddress: string | null = null
  let subject: string | null = null
  let emailText: string | null = null
  let receivedAt = new Date().toISOString()

  try {
    const full = await client.inboxes.messages.get(inboxId, messageId)

    fromAddress = full.from ?? null
    subject = full.subject ?? null
    receivedAt = toIso(full.timestamp)
    emailText = full.text?.trim()
      ? full.text
      : full.html
        ? stripHtml(full.html)
        : (full.extractedText ?? null)

    const receiptAttachments = (full.attachments ?? []).filter(
      (a) => a.contentType && RECEIPT_MIME_TYPES.has(a.contentType),
    )

    if (receiptAttachments.length > 0) {
      for (const attachment of receiptAttachments) {
        const { base64, mimeType, filename } = await fetchAttachmentBase64(
          client, inboxId, messageId, attachment.attachmentId,
        )
        let parsedList: ParsedReceiptFields[]
        let failReason: string | undefined
        try {
          parsedList = await parseReceiptFile(base64, mimeType)
        } catch (err) {
          parsedList = [{ ...EMPTY_PARSED }]
          failReason = err instanceof Error ? err.message : 'Claude parsing failed'
        }
        // One attachment can bundle several receipts (e.g. a scan of multiple
        // paper receipts stacked together).
        for (const parsed of parsedList) {
          await handleParsedResult(tally, parsed, failReason, {
            fromAddress, subject,
            fileName: filename ?? attachment.filename ?? null,
            mimeType,
            fileBase64: base64,
            emailText: null,
          }, forceReview)
        }
      }
    } else if (emailText && emailText.trim()) {
      let parsedList: ParsedReceiptFields[]
      let failReason: string | undefined
      try {
        parsedList = await parseReceiptEmailText(emailText, subject)
      } catch (err) {
        parsedList = [{ ...EMPTY_PARSED }]
        failReason = err instanceof Error ? err.message : 'Claude parsing failed'
      }
      // Each detected receipt is handled independently -- one bundled digest
      // email can produce several receipts (or several review items).
      for (const parsed of parsedList) {
        await handleParsedResult(tally, parsed, failReason, {
          fromAddress, subject, fileName: null, mimeType: null, fileBase64: null, emailText,
        }, forceReview)
      }
    } else {
      const reason = 'No receipt attachment and no email body to parse'
      tally.reviewed += 1
      tally.reason = reason
      await createReviewItem({
        from_address: fromAddress, subject, file_name: null, mime_type: null,
        file_base64: null, email_text: emailText, parsed: null, reason,
      })
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unexpected ingestion error'
    tally.reviewed += 1
    tally.reason ??= reason
    try {
      await createReviewItem({
        from_address: fromAddress, subject, file_name: null, mime_type: null,
        file_base64: null, email_text: emailText, parsed: null, reason,
      })
    } catch (reviewErr) {
      console.error('Failed to record email ingestion error', messageId, reviewErr)
    }
  }

  const record: EmailReceipt = {
    message_id:   messageId,
    status:       tally.reviewed === 0 && tally.created > 0 ? 'parsed' : 'review',
    from_address: fromAddress,
    subject,
    received_at:  receivedAt,
    merchant:     tally.merchant,
    receipt_date: tally.date,
    amount:       tally.created > 0 ? Math.round(tally.amount * 100) / 100 : null,
    detail:       tally.reviewed > 0
      ? `${tally.created > 0 ? `${tally.created} added, ` : ''}${tally.reviewed} in Needs Review${tally.reason ? ` (${tally.reason})` : ''}`
      : tally.created > 1 ? `${tally.created} receipts` : null,
  }
  await upsertEmailReceipt(record)
  return record
}

// Claims then parses a message. Returns null if it was already claimed
// (parsed before, or being parsed right now by the webhook/another check).
async function claimAndParse(client: AgentMailClient, inboxId: string, messageId: string, isSpam: boolean): Promise<EmailReceipt | null> {
  if (!(await claimMessageId(messageId))) return null
  return parseMessage(client, inboxId, messageId, isSpam)
}

// Lists an email as waiting without parsing it (auto-parse off).
async function recordPending(client: AgentMailClient, inboxId: string, messageId: string): Promise<void> {
  const full = await client.inboxes.messages.get(inboxId, messageId)
  await upsertEmailReceipt({
    message_id: messageId, status: 'pending',
    from_address: full.from ?? null, subject: full.subject ?? null, received_at: toIso(full.timestamp),
    merchant: null, receipt_date: null, amount: null, detail: null,
  })
}

export interface CheckInboxResult {
  parsed: number
  needs_review: number
  remaining: number
}

// How many recent emails "Check inbox" looks at, and how many it will parse
// in one request (each parse is a Claude call; keeps the request well under
// the route's time limit).
const CHECK_WINDOW = 50
const MAX_PARSE_PER_CHECK = 10

export async function checkInbox(): Promise<CheckInboxResult> {
  await ensureTable()
  const client = getAgentMailClient()
  const { messages } = await client.inboxes.messages.list(RECEIPTS_INBOX, {
    limit: CHECK_WINDOW, labels: ['received'], includeSpam: true,
  })

  const statuses = await getEmailReceiptStatuses(messages.map((m) => m.messageId))
  const todo = messages.filter((m) => {
    const status = statuses.get(m.messageId)
    return status == null || status === 'pending'
  })

  const result: CheckInboxResult = { parsed: 0, needs_review: 0, remaining: 0 }
  let attempted = 0
  for (const m of todo) {
    if (attempted >= MAX_PARSE_PER_CHECK) {
      result.remaining += 1
      continue
    }
    attempted += 1
    const outcome = await claimAndParse(client, RECEIPTS_INBOX, m.messageId, m.labels.includes('spam'))
    if (outcome?.status === 'parsed') result.parsed += 1
    else if (outcome?.status === 'review') result.needs_review += 1
  }

  await markChecked()
  return result
}

export async function handleInboundEmailWebhook(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'AGENTMAIL_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const headers = {
    'svix-id':        request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  try {
    // Throws if the signature is invalid; this version of svix does not
    // return the parsed payload, so the body is parsed separately below.
    new Webhook(secret).verify(rawBody, headers)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }
  const event = JSON.parse(rawBody) as InboundWebhookEvent

  // Spam-flagged mail is still parsed -- SPF/DKIM can pass on a genuine
  // forward that AgentMail's filter nonetheless flags -- but never
  // auto-creates a receipt; it always lands in Needs Review instead.
  const isSpam = event.event_type === 'message.received.spam'
  if (event.event_type !== 'message.received' && !isSpam) {
    return NextResponse.json({ ok: true, skipped: 'not a received-message event' })
  }

  await ensureTable()
  const { inbox_id, message_id } = event.message
  const client = getAgentMailClient()

  if (!(await getAutoParse())) {
    // Not claimed, so "Check inbox" parses it later. A failure here is
    // harmless for the same reason.
    try {
      await recordPending(client, inbox_id, message_id)
    } catch (err) {
      console.error('Failed to record pending email', message_id, err)
    }
    return NextResponse.json({ ok: true, skipped: 'auto-parse is off' })
  }

  const outcome = await claimAndParse(client, inbox_id, message_id, isSpam)
  if (!outcome) return NextResponse.json({ ok: true, skipped: 'duplicate delivery' })
  await markChecked()
  return NextResponse.json({ ok: true })
}

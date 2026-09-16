import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { getAgentMailClient, fetchAttachmentBase64 } from '@/src/lib/agentmail'
import { parseReceiptFile, parseReceiptEmailText } from '@/src/lib/anthropic'
import { createReceipt, createReviewItem, claimMessageId, ensureTable } from '@/src/lib/db'
import { EXPENSE_CATEGORIES } from '@/src/types'
import type { ReceiptCreate, ParsedReceiptFields } from '@/src/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const RECEIPT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const CONFIDENCE_THRESHOLD = 0.7

// AgentMail's SDK types (camelCase) describe values returned by SDK calls,
// which go through its response deserializer. A raw webhook body is wire
// JSON (snake_case) and is never deserialized by the SDK, so it needs its
// own shape here rather than reusing e.g. AgentMail.MessageReceivedEvent.
// The webhook payload's inline message fields (text/html/attachments) are
// not reliable -- observed empty on a real forwarded email even though the
// content exists -- so only the identifiers are read from it; the full
// message is always re-fetched via the API below.
interface InboundMessage {
  inbox_id: string
  message_id: string
}

interface InboundWebhookEvent {
  type: 'event'
  event_type: string
  event_id: string
  message: InboundMessage
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

async function handleParsedResult(
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
): Promise<void> {
  const usable = isUsable(parsed)
  if (usable.ok && !reasonIfFailed) {
    await createReceipt(toReceiptCreate(parsed), 'Email (auto)')
    return
  }
  await createReviewItem({
    from_address: common.fromAddress,
    subject:      common.subject,
    file_name:    common.fileName,
    mime_type:    common.mimeType,
    file_base64:  common.fileBase64,
    email_text:   common.emailText,
    parsed,
    reason: reasonIfFailed ?? (usable.ok ? 'Unknown' : usable.reason),
  })
}

export async function POST(request: NextRequest) {
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

  if (event.event_type !== 'message.received') {
    return NextResponse.json({ ok: true, skipped: 'not a received-message event' })
  }

  const { message } = event
  const isNew = await claimMessageId(message.message_id)
  if (!isNew) {
    return NextResponse.json({ ok: true, skipped: 'duplicate delivery' })
  }

  await ensureTable()

  // Everything below -- including the message fetch itself -- must stay
  // inside this try. The message is already marked "claimed" above, so any
  // uncaught throw here (e.g. a transient AgentMail API failure) would
  // otherwise silently drop the email forever: no receipt, no review item,
  // and no retry, since a redelivery would just see it as already claimed.
  let fromAddress: string | null = null
  let subject: string | null = null
  let emailText: string | null = null

  try {
    const client = getAgentMailClient()
    const full = await client.inboxes.messages.get(message.inbox_id, message.message_id)

    fromAddress = full.from ?? null
    subject = full.subject ?? null
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
          client, message.inbox_id, message.message_id, attachment.attachmentId,
        )
        let parsed: ParsedReceiptFields
        let failReason: string | undefined
        try {
          parsed = await parseReceiptFile(base64, mimeType)
        } catch (err) {
          parsed = { ...EMPTY_PARSED }
          failReason = err instanceof Error ? err.message : 'Claude parsing failed'
        }
        await handleParsedResult(parsed, failReason, {
          fromAddress, subject,
          fileName: filename ?? attachment.filename ?? null,
          mimeType,
          fileBase64: base64,
          emailText: null,
        })
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
        await handleParsedResult(parsed, failReason, {
          fromAddress, subject, fileName: null, mimeType: null, fileBase64: null, emailText,
        })
      }
    } else {
      await createReviewItem({
        from_address: fromAddress,
        subject,
        file_name: null,
        mime_type: null,
        file_base64: null,
        email_text: emailText,
        parsed: null,
        reason: 'No receipt attachment and no email body to parse',
      })
    }
  } catch (err) {
    await createReviewItem({
      from_address: fromAddress,
      subject,
      file_name: null,
      mime_type: null,
      file_base64: null,
      email_text: emailText,
      parsed: null,
      reason: err instanceof Error ? err.message : 'Unexpected ingestion error',
    })
  }

  return NextResponse.json({ ok: true })
}

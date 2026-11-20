import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ensureTable, listEmailReceipts } from '@/src/lib/db'
import { getSessionUser, SESSION_COOKIE } from '@/src/lib/session'
import { getAgentMailClient, isAgentMailConfigured, RECEIPTS_INBOX } from '@/src/lib/agentmail'
import { getAutoParse, getLastCheckedAt } from '@/src/lib/emailReceipts'

export const runtime = 'nodejs'

// State for the Email Receipts panel: inbox connection, auto-parse setting,
// and the most recent emails with their parse outcome.
export async function GET() {
  try {
    await ensureTable()
    const [items, autoParse, lastCheckedAt, user] = await Promise.all([
      listEmailReceipts(),
      getAutoParse(),
      getLastCheckedAt(),
      getSessionUser((await cookies()).get(SESSION_COOKIE)?.value),
    ])

    let connected = false
    let connectionError: string | null = null
    if (!isAgentMailConfigured()) {
      connectionError = 'AGENTMAIL_API_KEY is not set'
    } else {
      try {
        await getAgentMailClient().inboxes.get(RECEIPTS_INBOX)
        connected = true
      } catch (err) {
        connectionError = err instanceof Error ? err.message : 'Could not reach the receipts inbox'
      }
    }

    return NextResponse.json({
      connected,
      connection_error: connectionError,
      inbox_address: RECEIPTS_INBOX,
      // New mail is only picked up live when the webhook is set up.
      watching: Boolean(process.env.AGENTMAIL_WEBHOOK_SECRET),
      auto_parse: autoParse,
      last_checked_at: lastCheckedAt,
      // UI hint only; the settings route enforces it.
      can_manage: user?.role === 'admin',
      items,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

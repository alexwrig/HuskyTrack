import { NextRequest, NextResponse } from 'next/server'
import { handleInboundEmailWebhook } from '@/src/legacy/inboundEmail'

export const runtime = 'nodejs'
export const maxDuration = 120

// Email-forwarded receipt ingestion is superseded by Plaid transactions.
// See src/legacy/inboundEmail.ts. Set ENABLE_EMAIL_INGESTION=true to
// re-enable this webhook.
export async function POST(request: NextRequest) {
  if (process.env.ENABLE_EMAIL_INGESTION !== 'true') {
    return NextResponse.json({ error: 'Email ingestion is disabled' }, { status: 404 })
  }
  return handleInboundEmailWebhook(request)
}

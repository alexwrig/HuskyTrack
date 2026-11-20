import { NextRequest } from 'next/server'
import { handleInboundEmailWebhook } from '@/src/lib/emailReceipts'

export const runtime = 'nodejs'
export const maxDuration = 120

// AgentMail webhook for the receipts inbox. See src/lib/emailReceipts.ts.
export async function POST(request: NextRequest) {
  return handleInboundEmailWebhook(request)
}

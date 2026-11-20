import { NextResponse } from 'next/server'
import { checkInbox } from '@/src/lib/emailReceipts'

export const runtime = 'nodejs'
// Parses up to 10 emails per request, each a Claude call.
export const maxDuration = 300

// "Check inbox": parse any recent receipt emails not parsed yet.
export async function POST() {
  try {
    return NextResponse.json(await checkInbox())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

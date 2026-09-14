import { NextResponse } from 'next/server'
import { listReviewItems, ensureTable } from '@/src/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await ensureTable()
    const items = await listReviewItems('pending')
    return NextResponse.json(items)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

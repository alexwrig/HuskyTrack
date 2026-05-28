import { NextRequest, NextResponse } from 'next/server'
import { listReceipts, clearAllReceipts, ensureTable } from '@/src/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const receipts = await listReceipts({
      category:   searchParams.get('category') ?? undefined,
      start_date: searchParams.get('start_date') ?? undefined,
      end_date:   searchParams.get('end_date') ?? undefined,
    })
    return NextResponse.json(receipts)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await ensureTable()
    await clearAllReceipts()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

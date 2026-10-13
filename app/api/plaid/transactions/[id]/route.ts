import { NextRequest, NextResponse } from 'next/server'
import { ensureTable, getPlaidTransactionDetails } from '@/src/lib/db'

export const runtime = 'nodejs'

// Raw Plaid data for one bank-synced transaction (info panel). Fetched on
// demand rather than shipped with the transaction list to keep that small.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params
    const result = await getPlaidTransactionDetails(id)
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { listAllTransactions, clearAllReceipts, ensureTable } from '@/src/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const category  = searchParams.get('category')
    const startDate = searchParams.get('start_date')
    const endDate   = searchParams.get('end_date')
    const city      = searchParams.get('city')

    // Merges legacy receipts (email/manual upload) with synced Plaid
    // transactions into one sorted list; the frontend doesn't currently
    // send these params (it filters client-side) but the route still
    // honors them for API symmetry.
    let transactions = await listAllTransactions()
    if (category)  transactions = transactions.filter((t) => t.category === category)
    if (startDate) transactions = transactions.filter((t) => t.date >= startDate)
    if (endDate)   transactions = transactions.filter((t) => t.date <= endDate)
    if (city)      transactions = transactions.filter((t) => t.city === city)

    return NextResponse.json(transactions)
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

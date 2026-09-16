import { NextRequest, NextResponse } from 'next/server'
import { listAllTransactions, ensureTable } from '@/src/lib/db'
import { generateXlsx } from '@/src/lib/xlsx'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const categories = searchParams.getAll('category')
    const cities = searchParams.getAll('city')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    let transactions = await listAllTransactions()
    if (categories.length > 0) transactions = transactions.filter((t) => categories.includes(t.category))
    if (cities.length > 0) transactions = transactions.filter((t) => t.city && cities.includes(t.city))
    if (startDate) transactions = transactions.filter((t) => t.date >= startDate)
    if (endDate) transactions = transactions.filter((t) => t.date <= endDate)

    const buffer = generateXlsx(transactions)
    const filename = `HuskyTrack_Expenses_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

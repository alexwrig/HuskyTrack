import { NextResponse } from 'next/server'
import { listReceipts, ensureTable } from '@/src/lib/db'
import { generateXlsx } from '@/src/lib/xlsx'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await ensureTable()
    const receipts = await listReceipts()
    const buffer = generateXlsx(receipts)
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

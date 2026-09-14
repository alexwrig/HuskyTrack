import { NextRequest, NextResponse } from 'next/server'
import { getReviewItem, setReviewItemStatus, createReceipt, ensureTable } from '@/src/lib/db'
import type { ReceiptCreate } from '@/src/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params
    const item = await getReviewItem(id)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json() as { action: 'approve' | 'discard'; receipt?: ReceiptCreate }

    if (body.action === 'discard') {
      await setReviewItemStatus(id, 'discarded')
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'approve') {
      if (!body.receipt) return NextResponse.json({ error: 'Missing receipt data' }, { status: 400 })
      const receipt = await createReceipt(body.receipt)
      await setReviewItemStatus(id, 'resolved')
      return NextResponse.json({ ok: true, receipt })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

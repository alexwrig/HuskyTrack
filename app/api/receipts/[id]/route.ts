import { NextRequest, NextResponse } from 'next/server'
import { deleteReceipt, updateReceipt, ensureTable } from '@/src/lib/db'
import type { ReceiptUpdate } from '@/src/types'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params
    await deleteReceipt(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params
    const body = await req.json() as ReceiptUpdate
    const updated = await updateReceipt(id, body)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

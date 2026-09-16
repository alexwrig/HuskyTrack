import { NextRequest, NextResponse } from 'next/server'
import { deleteTransaction, updateTransaction, ensureTable } from '@/src/lib/db'
import type { ReceiptUpdate } from '@/src/types'

export const runtime = 'nodejs'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params
    // Tries the legacy receipts table first, then plaid_transactions -- the
    // frontend edits/deletes by id without knowing which table a row is in.
    await deleteTransaction(id)
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
    const updated = await updateTransaction(id, body)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

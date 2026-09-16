import { NextRequest, NextResponse } from 'next/server'
import { ensureAuthTables, removeGuest } from '@/src/lib/auth'
import { requireAdmin } from '@/src/lib/requireAdmin'

export const runtime = 'nodejs'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    await ensureAuthTables()
    const { id } = await params
    const removed = await removeGuest(id)
    if (!removed) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { ensureAuthTables, listGuests, addGuest } from '@/src/lib/auth'
import { requireAdmin } from '@/src/lib/requireAdmin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    await ensureAuthTables()
    const guests = await listGuests()
    return NextResponse.json(guests)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  try {
    await ensureAuthTables()
    const { email } = await request.json() as { email?: string }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const guest = await addGuest(email)
    return NextResponse.json(guest)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

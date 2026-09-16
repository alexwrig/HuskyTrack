import { NextRequest, NextResponse } from 'next/server'
import { ensureAuthTables, requestLoginCode } from '@/src/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    await ensureAuthTables()
    const { email } = await request.json() as { email?: string }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const result = await requestLoginCode(email)
    if (!result.ok) {
      return NextResponse.json({ error: result.reason ?? 'Could not send code' }, { status: 429 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

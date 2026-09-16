import { NextRequest, NextResponse } from 'next/server'
import { ensureAuthTables, verifyLoginCode, SESSION_COOKIE } from '@/src/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    await ensureAuthTables()
    const { email, code } = await request.json() as { email?: string; code?: string }
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    const result = await verifyLoginCode(email, code)
    if (!result.ok || !result.sessionToken) {
      return NextResponse.json({ error: result.reason ?? 'Invalid code' }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(result.expiresAt!),
      path: '/',
    })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

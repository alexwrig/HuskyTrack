import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'ht_auth'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

async function hash(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  const { password } = await request.json() as { password: string }
  const sitePassword = process.env.SITE_PASSWORD

  if (!sitePassword || password !== sitePassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, await hash(sitePassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE)
  return res
}

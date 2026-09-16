import { NextRequest, NextResponse } from 'next/server'
import { validateSession, SESSION_COOKIE } from '@/src/lib/session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/inbound-email') ||
    pathname.startsWith('/api/plaid/webhook')
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const valid = await validateSession(token)

  if (!valid) {
    const loginUrl = new URL('/login', request.url)
    const res = NextResponse.redirect(loginUrl)
    if (token) res.cookies.delete(SESSION_COOKIE)
    return res
  }

  return NextResponse.next()
}

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, SESSION_COOKIE } from '@/src/lib/session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/inbound-email') ||
    pathname.startsWith('/api/plaid/webhook')
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const user = await getSessionUser(token)

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    const res = NextResponse.redirect(loginUrl)
    if (token) res.cookies.delete(SESSION_COOKIE)
    return res
  }

  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  if (isAdminRoute && user.role !== 'admin') {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

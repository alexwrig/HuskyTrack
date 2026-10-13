import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, SESSION_COOKIE } from '@/src/lib/session'

export const config = {
  // icon.svg is Next.js's app-directory favicon convention (distinct from
  // the legacy public/favicon.ico already excluded below) -- it must stay
  // reachable without a session or browsers can't even load the tab icon
  // on the login page itself.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
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

  // Guests share the admin's data and can view/sync it, but only the admin
  // can link, reconnect (update-mode link tokens), or remove bank accounts.
  const isPlaidManageRoute =
    pathname.startsWith('/api/plaid/create-link-token') ||
    pathname.startsWith('/api/plaid/exchange-public-token') ||
    (pathname.startsWith('/api/plaid/items/') && request.method === 'DELETE')
  if (isPlaidManageRoute && user.role !== 'admin') {
    return NextResponse.json({ error: 'Only the admin can link or remove bank accounts.' }, { status: 403 })
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

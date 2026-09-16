import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, SESSION_COOKIE } from './session'
import { isAdminEmail } from './auth'

// Middleware already blocks non-admins from reaching /api/admin/*, but each
// route re-checks independently (defense in depth) rather than trusting
// that gate alone -- and role is cross-checked against the ADMIN_EMAIL env
// var, not just the stored column, in case that ever drifts.
export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const user = await getSessionUser(token)
  if (!user || user.role !== 'admin' || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

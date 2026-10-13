import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ensureTable, listPlaidAccounts, listPlaidItems } from '@/src/lib/db'
import { getSessionUser, SESSION_COOKIE } from '@/src/lib/session'

export const runtime = 'nodejs'

// Linked institutions + their accounts, for the accounts panel. Never
// includes access tokens or sync cursors.
export async function GET() {
  try {
    await ensureTable()
    const [items, accounts, user] = await Promise.all([
      listPlaidItems(),
      listPlaidAccounts(),
      getSessionUser((await cookies()).get(SESSION_COOKIE)?.value),
    ])
    return NextResponse.json({
      // UI hint only; middleware enforces it on the link/remove routes.
      can_manage: user?.role === 'admin',
      items: items.map((item) => ({
        id: item.id,
        institution_name: item.institution_name,
        status: item.status,
        error_code: item.error_code,
        last_synced_at: item.last_synced_at,
        created_at: item.created_at,
        accounts: accounts
          .filter((a) => a.item_id === item.id)
          .map((a) => ({ id: a.id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype })),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

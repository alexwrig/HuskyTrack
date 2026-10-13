import { NextRequest, NextResponse } from 'next/server'
import { getPlaidClient, logPlaidError } from '@/src/lib/plaid'
import { encrypt } from '@/src/lib/crypto'
import { createPlaidItem, ensureTable } from '@/src/lib/db'

export const runtime = 'nodejs'

// Exchanges Link's short-lived public_token for a permanent access_token,
// which is encrypted and stored server-side only -- the response carries
// just our internal item id. The client calls /api/plaid/sync next (kept
// separate so a slow first sync can't make the link itself look failed).
export async function POST(request: NextRequest) {
  try {
    await ensureTable()

    const body = await request.json() as { public_token?: string; institution_name?: string | null }
    if (!body.public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 })
    }

    const exchange = await getPlaidClient().itemPublicTokenExchange({ public_token: body.public_token })

    const item = await createPlaidItem({
      item_id: exchange.data.item_id,
      access_token_encrypted: encrypt(exchange.data.access_token),
      institution_name: body.institution_name ?? null,
    })

    return NextResponse.json({ ok: true, item_id: item.id })
  } catch (err) {
    const info = logPlaidError('item/public_token/exchange', err)
    return NextResponse.json(
      { error: info.message, error_code: info.error_code, request_id: info.request_id },
      { status: info.status },
    )
  }
}

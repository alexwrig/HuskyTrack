import { NextRequest, NextResponse } from 'next/server'
import { getPlaidClient } from '@/src/lib/plaid'
import { encrypt } from '@/src/lib/crypto'
import { createPlaidItem, ensureTable } from '@/src/lib/db'
import { syncPlaidItem } from '@/src/lib/plaidSync'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    await ensureTable()

    const body = await request.json() as { public_token?: string; institution_name?: string }
    if (!body.public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 })
    }

    const client = getPlaidClient()
    const exchange = await client.itemPublicTokenExchange({ public_token: body.public_token })

    const item = await createPlaidItem({
      item_id: exchange.data.item_id,
      access_token_encrypted: encrypt(exchange.data.access_token),
      institution_name: body.institution_name ?? null,
    })

    const result = await syncPlaidItem(item.id)

    return NextResponse.json({ ok: true, item_id: item.id, synced: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

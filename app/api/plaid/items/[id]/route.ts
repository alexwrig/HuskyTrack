import { NextRequest, NextResponse } from 'next/server'
import { getPlaidClient, getPlaidErrorInfo, logPlaidError } from '@/src/lib/plaid'
import { decrypt } from '@/src/lib/crypto'
import { deletePlaidItemAndData, ensureTable, getPlaidItemAccessTokenEncrypted } from '@/src/lib/db'

export const runtime = 'nodejs'

// Item is already gone on Plaid's side, so local cleanup should still proceed.
const ALREADY_REMOVED_CODES = new Set(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'])

// Unlinks a bank: revokes the access token at Plaid (/item/remove, which
// also stops billing for it), then deletes the item, its accounts, and
// every transaction synced from it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable()
    const { id } = await params

    const encrypted = await getPlaidItemAccessTokenEncrypted(id)
    if (!encrypted) return NextResponse.json({ error: 'Linked account not found' }, { status: 404 })

    try {
      await getPlaidClient().itemRemove({ access_token: decrypt(encrypted) })
    } catch (err) {
      if (!ALREADY_REMOVED_CODES.has(getPlaidErrorInfo(err).error_code ?? '')) {
        const info = logPlaidError('item/remove', err)
        return NextResponse.json(
          { error: info.message, error_code: info.error_code, request_id: info.request_id },
          { status: info.status },
        )
      }
    }

    await deletePlaidItemAndData(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { getPlaidClient } from '@/src/lib/plaid'
import { getPlaidItemByPlaidItemId, ensureTable } from '@/src/lib/db'
import { syncPlaidItem } from '@/src/lib/plaidSync'
import type { JWKPublicKey } from 'plaid'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_TOKEN_AGE_SECONDS = 5 * 60

interface PlaidWebhookPayload {
  webhook_type: string
  webhook_code: string
  item_id: string
}

async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null): Promise<boolean> {
  if (!verificationHeader) return false

  try {
    const { kid } = decodeProtectedHeader(verificationHeader)
    if (!kid) return false

    const client = getPlaidClient()
    const { data } = await client.webhookVerificationKeyGet({ key_id: kid })
    const jwk = data.key as JWKPublicKey

    const key = await importJWK(
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      'ES256',
    )

    const { payload } = await jwtVerify(verificationHeader, key, { maxTokenAge: MAX_TOKEN_AGE_SECONDS })

    const expectedHash = createHash('sha256').update(rawBody).digest('hex')
    return payload.request_body_sha256 === expectedHash
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const verified = await verifyPlaidWebhook(rawBody, request.headers.get('plaid-verification'))
  if (!verified) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  const payload = JSON.parse(rawBody) as PlaidWebhookPayload

  if (payload.webhook_type !== 'TRANSACTIONS' || payload.webhook_code !== 'SYNC_UPDATES_AVAILABLE') {
    return NextResponse.json({ ok: true, skipped: 'not a sync-updates webhook' })
  }

  await ensureTable()
  const item = await getPlaidItemByPlaidItemId(payload.item_id)
  if (!item) {
    return NextResponse.json({ ok: true, skipped: 'unknown item_id' })
  }

  try {
    const result = await syncPlaidItem(item.id)
    return NextResponse.json({ ok: true, synced: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

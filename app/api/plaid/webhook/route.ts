import { NextRequest, NextResponse, after } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { decodeProtectedHeader, importJWK, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { getPlaidClient, logPlaidError } from '@/src/lib/plaid'
import { getPlaidItemByPlaidItemId, ensureTable, setPlaidItemStatus } from '@/src/lib/db'
import { syncPlaidItem } from '@/src/lib/plaidSync'
import type { JWKPublicKey } from 'plaid'

export const runtime = 'nodejs'
// The sync runs after the response (see after() below), but still counts
// toward the function's duration.
export const maxDuration = 300

const MAX_TOKEN_AGE_SECONDS = 5 * 60

interface PlaidWebhookPayload {
  webhook_type: string
  webhook_code: string
  item_id?: string
  error?: { error_code?: string; error_message?: string } | null
}

// Plaid rotates keys rarely; caching by kid avoids a Plaid round trip per
// webhook. Fluid Compute reuses instances, so this survives across requests.
const keyCache = new Map<string, JWKPublicKey>()

async function getVerificationKey(kid: string): Promise<JWKPublicKey> {
  const cached = keyCache.get(kid)
  if (cached) return cached
  const { data } = await getPlaidClient().webhookVerificationKeyGet({ key_id: kid })
  keyCache.set(kid, data.key)
  return data.key
}

// https://plaid.com/docs/api/webhooks/webhook-verification/
async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null): Promise<boolean> {
  if (!verificationHeader) return false

  try {
    const { kid, alg } = decodeProtectedHeader(verificationHeader)
    if (!kid || alg !== 'ES256') return false

    const jwk = await getVerificationKey(kid)
    // A key Plaid has rotated out must no longer be trusted.
    if (jwk.expired_at != null && jwk.expired_at * 1000 < Date.now()) return false

    const getKey: JWTVerifyGetKey = () => importJWK({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, 'ES256')
    const { payload } = await jwtVerify(verificationHeader, getKey, {
      algorithms: ['ES256'],
      maxTokenAge: MAX_TOKEN_AGE_SECONDS,
    })

    const expected = createHash('sha256').update(rawBody).digest('hex')
    const claimed = typeof payload.request_body_sha256 === 'string' ? payload.request_body_sha256 : ''
    return claimed.length === expected.length && timingSafeEqual(Buffer.from(claimed), Buffer.from(expected))
  } catch (err) {
    logPlaidError('webhook verification', err)
    return false
  }
}

// ITEM webhook codes that mean the user has to go through Link update mode.
const NEEDS_RELINK_CODES = new Set(['PENDING_EXPIRATION', 'PENDING_DISCONNECT'])
const REVOKED_CODES = new Set(['USER_PERMISSION_REVOKED', 'USER_ACCOUNT_REVOKED'])

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const verified = await verifyPlaidWebhook(rawBody, request.headers.get('plaid-verification'))
  if (!verified) {
    console.warn('[plaid] webhook rejected: invalid Plaid-Verification signature')
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as PlaidWebhookPayload
  console.info('[plaid] webhook received', {
    webhook_type: payload.webhook_type,
    webhook_code: payload.webhook_code,
    item_id: payload.item_id,
    error_code: payload.error?.error_code,
  })

  if (!payload.item_id) return NextResponse.json({ ok: true, skipped: 'no item_id' })

  await ensureTable()
  const item = await getPlaidItemByPlaidItemId(payload.item_id)
  if (!item) {
    return NextResponse.json({ ok: true, skipped: 'unknown item_id' })
  }

  const { webhook_type: type, webhook_code: code } = payload

  if (type === 'TRANSACTIONS' && code === 'SYNC_UPDATES_AVAILABLE') {
    // Acknowledge right away; Plaid retries webhooks that respond slowly, and
    // a sync (with AI classification) can take a while. Errors are logged
    // and recorded on the item by syncPlaidItem itself.
    after(async () => {
      try {
        await syncPlaidItem(item.id)
      } catch {
        // already logged + recorded on the item
      }
    })
    return NextResponse.json({ ok: true, queued: 'sync' })
  }

  if (type === 'ITEM') {
    if (code === 'ERROR') {
      const errorCode = payload.error?.error_code ?? 'UNKNOWN'
      console.error('[plaid] item error', { item_id: payload.item_id, error_code: errorCode, message: payload.error?.error_message })
      await setPlaidItemStatus(item.id, errorCode === 'ITEM_LOGIN_REQUIRED' ? 'login_required' : 'error', errorCode)
    } else if (NEEDS_RELINK_CODES.has(code)) {
      await setPlaidItemStatus(item.id, 'login_required', code)
    } else if (REVOKED_CODES.has(code)) {
      await setPlaidItemStatus(item.id, 'error', code)
    } else if (code === 'LOGIN_REPAIRED') {
      await setPlaidItemStatus(item.id, 'ok', null)
    }
    // WEBHOOK_UPDATE_ACKNOWLEDGED, NEW_ACCOUNTS_AVAILABLE, etc. are logged above only.
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, skipped: `${type}/${code} not handled` })
}

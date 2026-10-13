import { NextRequest, NextResponse } from 'next/server'
import { CountryCode, Products, type LinkTokenCreateRequest } from 'plaid'
import {
  getPlaidClient,
  getPlaidRedirectUri,
  getPlaidWebhookUrl,
  logPlaidError,
  PLAID_CLIENT_USER_ID,
} from '@/src/lib/plaid'
import { decrypt } from '@/src/lib/crypto'
import { ensureTable, getPlaidItemAccessTokenEncrypted } from '@/src/lib/db'

export const runtime = 'nodejs'

// 529 records span whole school years, so ask for the max history Plaid
// allows. Only applies to the item's first link (and is billed the same).
const DAYS_REQUESTED = 730

// Body (optional): { item_id } -- our internal plaid_items.id. When given,
// the token opens Link in update mode to repair that item's login
// (ITEM_LOGIN_REQUIRED etc.) instead of linking a new institution.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { item_id?: string }

    const req: LinkTokenCreateRequest = {
      user: { client_user_id: PLAID_CLIENT_USER_ID },
      client_name: 'HuskyTrack',
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: getPlaidWebhookUrl(),
      redirect_uri: getPlaidRedirectUri(),
    }

    if (body.item_id) {
      await ensureTable()
      const encrypted = await getPlaidItemAccessTokenEncrypted(body.item_id)
      if (!encrypted) return NextResponse.json({ error: 'Linked account not found' }, { status: 404 })
      req.access_token = decrypt(encrypted)
    } else {
      req.products = [Products.Transactions]
      req.transactions = { days_requested: DAYS_REQUESTED }
    }

    const response = await getPlaidClient().linkTokenCreate(req)
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err) {
    const info = logPlaidError('link/token/create', err)
    return NextResponse.json(
      { error: info.message, error_code: info.error_code, request_id: info.request_id },
      { status: info.status },
    )
  }
}

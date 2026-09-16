import { NextResponse } from 'next/server'
import { getPlaidClient, PLAID_CLIENT_USER_ID } from '@/src/lib/plaid'
import { CountryCode, Products } from 'plaid'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const client = getPlaidClient()

    const webhookHost = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined

    const response = await client.linkTokenCreate({
      user: { client_user_id: PLAID_CLIENT_USER_ID },
      client_name: 'HuskyTrack',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: webhookHost ? `${webhookHost}/api/plaid/webhook` : undefined,
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

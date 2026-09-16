import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID / PLAID_SECRET environment variables are not set.')
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  return new PlaidApi(configuration)
}

// HuskyTrack has no multi-user auth (single shared SITE_PASSWORD), so Plaid's
// own end-user concept is just a fixed id -- there is only ever one user.
export const PLAID_CLIENT_USER_ID = 'huskytrack-single-user'

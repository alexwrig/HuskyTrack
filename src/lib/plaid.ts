import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

// Defaults to Sandbox (fake test institutions/data only). Real bank accounts
// require Plaid's Production access approval (requested via their dashboard,
// billed per connected account) -- once approved, set PLAID_ENV=production
// and swap PLAID_SECRET for the Production secret (PLAID_CLIENT_ID is
// typically unchanged). See README/setup notes for the request process.
function getPlaidBasePath(): string {
  return process.env.PLAID_ENV === 'production'
    ? PlaidEnvironments.production
    : PlaidEnvironments.sandbox
}

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID / PLAID_SECRET environment variables are not set.')
  }

  const configuration = new Configuration({
    basePath: getPlaidBasePath(),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  return new PlaidApi(configuration)
}

// HuskyTrack is single-user, so Plaid's own end-user concept is just a fixed id.
export const PLAID_CLIENT_USER_ID = 'huskytrack-single-user'

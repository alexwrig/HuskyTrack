import 'server-only'
import { Configuration, PlaidApi, PlaidEnvironments, type PlaidError } from 'plaid'

// Sandbox (the default) only ever sees fake test institutions/data. Real bank
// accounts require Plaid's Production access approval (requested via their
// dashboard, billed per connected account) -- once approved, set
// PLAID_ENV=production and swap PLAID_SECRET for the Production secret
// (PLAID_CLIENT_ID is unchanged). See docs/plaid-setup.md.
export type PlaidEnv = 'sandbox' | 'production'

export function getPlaidEnv(): PlaidEnv {
  const env = (process.env.PLAID_ENV ?? 'sandbox').trim().toLowerCase()
  // Fail loudly on a typo like "prod" rather than silently using sandbox
  // with a production secret (which Plaid rejects with a confusing error).
  if (env !== 'sandbox' && env !== 'production') {
    throw new Error(`PLAID_ENV must be "sandbox" or "production" (got "${process.env.PLAID_ENV}").`)
  }
  return env
}

let cachedClient: PlaidApi | null = null

export function getPlaidClient(): PlaidApi {
  if (cachedClient) return cachedClient

  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID / PLAID_SECRET environment variables are not set.')
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[getPlaidEnv()],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  cachedClient = new PlaidApi(configuration)
  return cachedClient
}

// Must be a stable public URL (e.g. https://huskytrack.vercel.app/api/plaid/webhook),
// not VERCEL_URL -- that's the per-deployment hostname, which changes on every
// deploy and sits behind Vercel Deployment Protection, so Plaid can't reach it.
export function getPlaidWebhookUrl(): string | undefined {
  return process.env.PLAID_WEBHOOK_URL?.trim() || undefined
}

// Required in Production for OAuth institutions (Chase, BofA, Wells Fargo,
// ...). Must exactly match a URI on the Plaid Dashboard's Allowed redirect
// URIs list, e.g. https://huskytrack.vercel.app/oauth-return.
export function getPlaidRedirectUri(): string | undefined {
  return process.env.PLAID_REDIRECT_URI?.trim() || undefined
}

// HuskyTrack is single-user (guests share the admin's data), so Plaid's own
// end-user concept is just a fixed id.
export const PLAID_CLIENT_USER_ID = 'huskytrack-single-user'

export interface PlaidErrorInfo {
  error_code: string | null
  error_type: string | null
  request_id: string | null
  // Safe to show in the UI: Plaid's display_message when it has one,
  // otherwise its error_message, otherwise the generic JS message.
  message: string
  status: number
}

export function getPlaidErrorInfo(err: unknown): PlaidErrorInfo {
  // The Plaid SDK throws axios errors; duck-typed so we don't depend on
  // axios (a transitive dependency) directly.
  const response = (err as { response?: { status?: number; data?: unknown } } | null)?.response
  if (response?.data && typeof response.data === 'object') {
    const data = response.data as Partial<PlaidError>
    if (data.error_code) {
      return {
        error_code: data.error_code,
        error_type: data.error_type ?? null,
        request_id: data.request_id ?? null,
        message: data.display_message || data.error_message || data.error_code,
        status: response.status ?? 500,
      }
    }
  }
  return {
    error_code: null,
    error_type: null,
    request_id: null,
    message: err instanceof Error ? err.message : 'Server error',
    status: 500,
  }
}

// Logs the fields Plaid support asks for (error_code + request_id) and
// returns the parsed info so routes can surface a clear message.
export function logPlaidError(context: string, err: unknown): PlaidErrorInfo {
  const info = getPlaidErrorInfo(err)
  console.error(`[plaid] ${context} failed`, {
    error_code: info.error_code,
    error_type: info.error_type,
    request_id: info.request_id,
    message: info.message,
  })
  return info
}

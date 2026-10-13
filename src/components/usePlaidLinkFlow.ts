'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from 'react-plaid-link'

// OAuth banks send the user off-site and back to /oauth-return, which has to
// reopen Link with the *same* link token, so it's stashed here before Link
// opens. Only the short-lived link token is stored, never an access token.
export const OAUTH_STATE_KEY = 'huskytrack.plaid.oauth'

export interface OAuthState {
  link_token: string
  item_id: string | null
}

interface ApiError {
  error?: string
  error_code?: string | null
}

export function describeApiError(data: ApiError, fallback: string): string {
  const message = data.error ?? fallback
  return data.error_code && !message.includes(data.error_code) ? `${message} (${data.error_code})` : message
}

interface SyncResponse extends ApiError {
  ok?: boolean
  items?: { ok: boolean; institution_name: string | null; error?: string; error_code?: string | null }[]
}

export async function requestSync(itemId?: string): Promise<SyncResponse> {
  const res = await fetch('/api/plaid/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(itemId ? { item_id: itemId } : {}),
  })
  const data = await res.json().catch(() => ({})) as SyncResponse
  if (!res.ok) throw new Error(describeApiError(data, 'Sync failed'))
  return data
}

function saveOAuthState(state: OAuthState | null) {
  try {
    if (state) localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(state))
    else localStorage.removeItem(OAUTH_STATE_KEY)
  } catch {
    // storage unavailable: OAuth banks just won't resume, everything else works
  }
}

interface Options {
  // Our plaid_items.id: opens Link in update mode to repair that item's login.
  itemId?: string | null
  onComplete: () => void
  // Set only by /oauth-return to resume a Link session after the bank redirect.
  resume?: { token: string; receivedRedirectUri: string }
}

// Wraps the whole Link round trip: fetch a link token, open Link, exchange
// the public token (new items only), then run the first sync. All Plaid API
// calls happen in our server routes; the browser only ever sees link and
// public tokens.
export function usePlaidLinkFlow({ itemId = null, onComplete, resume }: Options) {
  const [token, setToken] = useState<string | null>(resume?.token ?? null)
  const [pendingOpen, setPendingOpen] = useState(Boolean(resume))
  const [status, setStatus] = useState<string | null>(resume ? 'Reconnecting...' : null)
  const [error, setError] = useState<string | null>(null)

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    saveOAuthState(null)
    setError(null)
    try {
      let targetId = itemId
      if (!targetId) {
        setStatus('Linking...')
        const res = await fetch('/api/plaid/exchange-public-token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            public_token: publicToken,
            institution_name: metadata.institution?.name ?? null,
          }),
        })
        const data = await res.json().catch(() => ({})) as ApiError & { ok?: boolean; item_id?: string }
        if (!res.ok || !data.item_id) throw new Error(describeApiError(data, 'Failed to link account'))
        targetId = data.item_id
      }

      // Linking succeeded even if this first sync comes back empty or fails:
      // new items often have no transactions for a few seconds, and the
      // webhook or "Sync now" picks them up later.
      setStatus('Syncing transactions...')
      const sync = await requestSync(targetId)
      const failed = sync.items?.find((i) => !i.ok)
      if (failed) setError(describeApiError(failed, 'Linked, but the first sync failed. Try "Sync now".'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link account')
    } finally {
      setStatus(null)
      onComplete()
    }
  }, [itemId, onComplete])

  const onExit = useCallback<PlaidLinkOnExit>((err, metadata) => {
    saveOAuthState(null)
    setStatus(null)
    if (err) {
      console.warn('[plaid] Link exited with error', {
        error_code: err.error_code,
        request_id: metadata.request_id,
        link_session_id: metadata.link_session_id,
      })
      setError(describeApiError({ error: err.display_message || err.error_message, error_code: err.error_code }, 'Plaid Link closed with an error'))
    }
    // On /oauth-return, a clean cancel goes home; an error stays on screen.
    if (resume && !err) onComplete()
  }, [onComplete, resume])

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
    receivedRedirectUri: resume?.receivedRedirectUri,
  })

  useEffect(() => {
    if (pendingOpen && ready) {
      setPendingOpen(false)
      setStatus(null)
      open()
    }
  }, [pendingOpen, ready, open])

  // Fresh token per launch: link tokens expire after 4 hours, so one fetched
  // on page load can be stale by the time the user clicks.
  const launch = useCallback(async () => {
    setError(null)
    setStatus('Opening...')
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(itemId ? { item_id: itemId } : {}),
      })
      const data = await res.json().catch(() => ({})) as ApiError & { link_token?: string }
      if (!res.ok || !data.link_token) throw new Error(describeApiError(data, 'Failed to start Plaid Link'))
      saveOAuthState({ link_token: data.link_token, item_id: itemId })
      setToken(data.link_token)
      setPendingOpen(true)
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : 'Failed to start Plaid Link')
    }
  }, [itemId])

  return { launch, status, busy: status !== null, error, setError }
}

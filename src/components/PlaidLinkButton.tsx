'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'

interface Props {
  onLinked: () => void
}

export function PlaidLinkButton({ onLinked }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((res) => res.json() as Promise<{ link_token?: string; error?: string }>)
      .then((data) => {
        if (data.link_token) setLinkToken(data.link_token)
        else setError(data.error ?? 'Failed to initialize Plaid Link')
      })
      .catch(() => setError('Failed to initialize Plaid Link'))
  }, [])

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata.institution?.name ?? null,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to link account')
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link account')
    } finally {
      setConnecting(false)
    }
  }, [onLinked])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  })

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-stone-300 dark:border-stone-700 text-[#4B2E83] focus:ring-[#4B2E83]"
        />
        I agree to the{' '}
        <Link href="/privacy" target="_blank" className="text-[#4B2E83] dark:text-purple-400 hover:underline">
          Privacy Policy
        </Link>
      </label>
      <button
        onClick={() => open()}
        disabled={!ready || connecting || !consented}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        {connecting ? 'Connecting...' : 'Connect'}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400 max-w-64 text-right">{error}</p>}
    </div>
  )
}

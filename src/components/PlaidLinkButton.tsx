'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePlaidLinkFlow } from './usePlaidLinkFlow'

interface Props {
  onLinked: () => void
}

export function PlaidLinkButton({ onLinked }: Props) {
  const [consented, setConsented] = useState(false)
  const { launch, status, busy, error } = usePlaidLinkFlow({ onComplete: onLinked })

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <label className="flex items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 px-3 py-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer hover:border-[#4B2E83]/40 dark:hover:border-purple-400/40 hover:bg-stone-100 dark:hover:bg-stone-900 transition-colors">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-stone-300 dark:border-stone-700 accent-[#4B2E83] focus:ring-2 focus:ring-[#4B2E83]/30 focus:ring-offset-0 cursor-pointer"
        />
        <span>
          I agree to the{' '}
          <Link href="/privacy" target="_blank" className="font-medium text-[#4B2E83] dark:text-purple-400 hover:underline">
            Privacy Policy
          </Link>
        </span>
      </label>
      <button
        onClick={launch}
        disabled={busy || !consented}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        {status ?? 'Connect'}
      </button>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 max-w-64 text-right">{error}</p>}
    </div>
  )
}

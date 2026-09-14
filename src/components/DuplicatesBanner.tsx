'use client'

import { useState } from 'react'
import type { DuplicateGroup } from '../types'

interface Props {
  groups: DuplicateGroup[]
  onResolve: () => Promise<void>
}

export function DuplicatesBanner({ groups, onResolve }: Props) {
  const [busy, setBusy] = useState(false)

  if (groups.length === 0) return null

  const extraCount = groups.reduce((sum, g) => sum + g.receipts.length - 1, 0)
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  const handleDelete = async () => {
    setBusy(true)
    await onResolve()
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {groups.length} possible {groups.length === 1 ? 'duplicate' : 'duplicates'} found
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Same date, merchant, and amount. Keeping the oldest copy in each group and removing {extraCount} {extraCount === 1 ? 'extra' : 'extras'}.
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {busy ? 'Deleting...' : 'Delete duplicates'}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {groups.map((g, i) => (
          <li key={i} className="text-xs text-stone-600 dark:text-stone-400">
            {g.receipts.length}× <span className="font-medium">{g.merchant}</span> on {g.date} for {fmt(g.amount)}
          </li>
        ))}
      </ul>
    </div>
  )
}

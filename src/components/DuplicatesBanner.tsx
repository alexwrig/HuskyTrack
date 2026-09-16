'use client'

import { useEffect, useState } from 'react'
import type { DuplicateGroup } from '../types'

interface Props {
  groups: DuplicateGroup[]
  onResolve: (groups: DuplicateGroup[]) => Promise<void>
}

function groupKey(g: DuplicateGroup): string {
  return `${g.date}|${g.merchant}|${g.amount}`
}

export function DuplicatesBanner({ groups, onResolve }: Props) {
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(groups.map(groupKey)))
  const [dismissed, setDismissed] = useState(false)
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null)

  const signature = groups.map(groupKey).sort().join(',')

  // Keep selection in sync as new duplicate groups are found (default
  // checked) or resolved ones disappear.
  useEffect(() => {
    setSelected(new Set(groups.map(groupKey)))
  }, [groups])

  // If the duplicate set actually changes (new ones found, or the previously
  // dismissed ones resolved) after a dismissal, show the banner again rather
  // than hiding it forever.
  useEffect(() => {
    if (dismissedSignature !== null && signature !== dismissedSignature) {
      setDismissed(false)
      setDismissedSignature(null)
    }
  }, [signature, dismissedSignature])

  if (groups.length === 0 || dismissed) return null

  const selectedGroups = groups.filter((g) => selected.has(groupKey(g)))
  const extraCount = selectedGroups.reduce((sum, g) => sum + g.receipts.length - 1, 0)
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => prev.size === groups.length ? new Set() : new Set(groups.map(groupKey)))
  }

  const handleDelete = async () => {
    if (selectedGroups.length === 0) return
    setBusy(true)
    await onResolve(selectedGroups)
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
            Same date, merchant, and amount. Keeping the oldest copy in each selected group and removing {extraCount} {extraCount === 1 ? 'extra' : 'extras'}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDelete}
            disabled={busy || selectedGroups.length === 0}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {busy ? 'Deleting...' : `Delete selected (${selectedGroups.length})`}
          </button>
          <button
            onClick={() => { setDismissed(true); setDismissedSignature(signature) }}
            aria-label="Dismiss"
            title="Dismiss"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {groups.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 pb-1 border-b border-amber-200/60 dark:border-amber-900/60 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={selected.size === groups.length}
              onChange={toggleAll}
              className="accent-amber-600"
            />
            {selected.size === groups.length ? 'Deselect all' : 'Select all'}
          </label>
        )}
        <ul className="flex flex-col gap-1">
          {groups.map((g) => {
            const key = groupKey(g)
            return (
              <li key={key}>
                <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggle(key)}
                    className="accent-amber-600"
                  />
                  {g.receipts.length}× <span className="font-medium">{g.merchant}</span> on {g.date} for {fmt(g.amount)}
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

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
  const [expanded, setExpanded] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const signature = groups.map(groupKey).sort().join(',')

  // groups starts empty (before the duplicates fetch resolves) and this
  // component mounts before real data arrives, so the useState initial
  // value above can't reflect the real count -- set the initial expanded
  // state once real data lands, but never again (so it doesn't fight a
  // manual toggle on later re-renders as duplicates get resolved).
  useEffect(() => {
    if (!initialized && groups.length > 0) {
      setExpanded(groups.length <= 3)
      setInitialized(true)
    }
  }, [groups, initialized])

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
    <div className="relative rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm pl-4 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-400 dark:bg-amber-500" />

      <div className="p-4 pl-3 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-start gap-2.5 text-left group/header"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.63-1.516 2.63H3.72c-1.347 0-2.189-1.463-1.515-2.63L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-stone-900 dark:text-stone-100">
                {groups.length} possible {groups.length === 1 ? 'duplicate' : 'duplicates'} found
                <svg
                  className={`h-3.5 w-3.5 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20" fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Same date, merchant, and amount. Keeping the oldest copy in each selected group and removing {extraCount} {extraCount === 1 ? 'extra' : 'extras'}.
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDelete}
              disabled={busy || selectedGroups.length === 0}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 shadow-sm"
            >
              {busy ? 'Deleting…' : `Delete selected (${selectedGroups.length})`}
            </button>
            <button
              onClick={() => { setDismissed(true); setDismissedSignature(signature) }}
              aria-label="Dismiss"
              title="Dismiss"
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex flex-col gap-1 pl-8 animate-fade-in">
            {groups.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 pb-2 mb-1 border-b border-stone-100 dark:border-stone-800 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={selected.size === groups.length}
                  onChange={toggleAll}
                  className="accent-amber-500"
                />
                {selected.size === groups.length ? 'Deselect all' : 'Select all'}
              </label>
            )}
            <ul className="flex flex-col divide-y divide-stone-50 dark:divide-stone-800/60">
              {groups.map((g) => {
                const key = groupKey(g)
                return (
                  <li key={key}>
                    <label className="flex items-center gap-2.5 py-1.5 px-1.5 -mx-1.5 rounded-lg text-xs text-stone-600 dark:text-stone-400 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        className="accent-amber-500 shrink-0"
                      />
                      <span className="tabular-nums text-stone-400 dark:text-stone-500">{g.receipts.length}×</span>
                      <span className="font-medium text-stone-800 dark:text-stone-200">{g.merchant}</span>
                      <span className="text-stone-400 dark:text-stone-500">on {g.date}</span>
                      <span className="ml-auto tabular-nums text-stone-700 dark:text-stone-300">{fmt(g.amount)}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

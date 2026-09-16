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

  // Keep selection in sync as new duplicate groups are found (default
  // checked) or resolved ones disappear.
  useEffect(() => {
    setSelected(new Set(groups.map(groupKey)))
  }, [groups])

  if (groups.length === 0) return null

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
        <button
          onClick={handleDelete}
          disabled={busy || selectedGroups.length === 0}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {busy ? 'Deleting...' : `Delete selected (${selectedGroups.length})`}
        </button>
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

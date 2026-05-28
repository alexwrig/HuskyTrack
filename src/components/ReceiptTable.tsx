'use client'

import { useState, useMemo } from 'react'
import { CategoryBadge } from './CategoryBadge'
import { EXPENSE_CATEGORIES } from '../types'
import type { Receipt, ExpenseCategory } from '../types'

interface Props {
  receipts: Receipt[]
  onDelete: (id: string) => void
}

export function ReceiptTable({ receipts, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return receipts.filter((r) => {
      if (category && r.category !== category) return false
      if (q && !r.merchant.toLowerCase().includes(q) && !r.date.includes(q)) return false
      return true
    })
  }, [receipts, search, category])

  const totalQualified = filtered.filter((r) => r.is_qualified).reduce((s, r) => s + r.amount, 0)
  const totalAll = filtered.reduce((s, r) => s + r.amount, 0)

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-20 text-center">
        <div className="rounded-2xl bg-stone-100 dark:bg-stone-800 p-4">
          <svg className="h-10 w-10 text-stone-300 dark:text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 0 0 2.25 2.25h.75" />
          </svg>
        </div>
        <div>
          <p className="font-display text-xl font-bold text-stone-700 dark:text-stone-300">Your receipts live here.</p>
          <p className="text-sm text-stone-400 dark:text-stone-600 mt-1">Upload some PDFs above to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search merchant or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 shadow-sm focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 shadow-sm focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors"
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
        <table className="min-w-full divide-y divide-stone-100 dark:divide-stone-800 text-sm">
          <thead className="bg-stone-50 dark:bg-stone-900/60">
            <tr>
              {['Date', 'Merchant', 'Amount', 'Category', 'Purpose', 'Card', 'Qualified', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-stone-500 dark:text-stone-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-stone-400 dark:text-stone-600">
                  No receipts match your filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400 whitespace-nowrap tabular-nums">{r.date}</td>
                  <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 max-w-48 truncate">{r.merchant}</td>
                  <td className="px-4 py-3 text-stone-900 dark:text-stone-100 whitespace-nowrap tabular-nums font-medium">{fmt(r.amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <CategoryBadge category={r.category as ExpenseCategory} />
                  </td>
                  <td className="px-4 py-3 text-stone-400 dark:text-stone-500 max-w-32 truncate">
                    {r.purpose_sub ?? r.purpose ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-stone-400 dark:text-stone-500 whitespace-nowrap tabular-nums">
                    {r.card_last_four ? `••••${r.card_last_four}` : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.is_qualified ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        Yes
                      </span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onDelete(r.id)}
                      className="text-stone-300 dark:text-stone-700 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-6 text-sm text-stone-500 dark:text-stone-500 px-1">
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100">{filtered.length}</span> receipts
          </span>
          <span>
            Qualified: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{fmt(totalQualified)}</span>
          </span>
          <span>
            Total: <span className="font-semibold text-stone-900 dark:text-stone-100">{fmt(totalAll)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

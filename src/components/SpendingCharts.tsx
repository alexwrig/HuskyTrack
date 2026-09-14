'use client'

import { useMemo, useState } from 'react'
import type { Receipt } from '../types'

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtFull = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// Single-series marks: validated for contrast against the card surface in
// both modes (light #4B2E83 on white = 10.4:1; dark purple-400 on stone-900
// = 6.3:1). One hue is correct here per the dataviz color-formula guidance --
// each bar is already uniquely identified by its own axis label, so color's
// job is just "this is a mark," not identity.
const BAR_BG = 'bg-[#4B2E83] dark:bg-purple-400'
const BAR_BG_HOVER = 'group-hover:bg-[#3d2569] dark:group-hover:bg-purple-300'

function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = Math.pow(10, exp)
  const fraction = value / base
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * base
}

function Tooltip({ label, value }: { label: string; value: string }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg bg-stone-900 dark:bg-stone-100 px-2.5 py-1.5 text-xs shadow-lg z-10"
    >
      <span className="font-semibold text-white dark:text-stone-900">{value}</span>
      <span className="ml-1.5 text-stone-300 dark:text-stone-600">{label}</span>
    </div>
  )
}

function TableToggle({ showTable, onToggle }: { showTable: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-xs text-stone-400 dark:text-stone-500 hover:text-[#4B2E83] dark:hover:text-purple-400 transition-colors underline decoration-dotted underline-offset-2"
    >
      {showTable ? 'View as chart' : 'View as table'}
    </button>
  )
}

function MonthlyTrendChart({ receipts }: { receipts: Receipt[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const months = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of receipts) {
      const month = r.date.slice(0, 7) // YYYY-MM
      totals.set(month, (totals.get(month) ?? 0) + r.amount)
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }))
  }, [receipts])

  if (months.length === 0) return null

  const max = niceMax(Math.max(...months.map((m) => m.total)))
  const gridSteps = [1, 0.75, 0.5, 0.25, 0]
  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">Monthly Spending</h3>
        <TableToggle showTable={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wide">
              <th className="pb-2 font-semibold">Month</th>
              <th className="pb-2 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="py-1.5 text-stone-700 dark:text-stone-300">{monthLabel(m.month)}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-900 dark:text-stone-100">{fmtFull(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex gap-4">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between h-48 text-xs text-stone-400 dark:text-stone-500 text-right tabular-nums pb-6">
            {gridSteps.map((s) => <span key={s}>{fmt(max * s)}</span>)}
          </div>

          {/* Plot area */}
          <div className="relative flex-1 h-48 flex items-end gap-1">
            {/* Gridlines */}
            <div className="absolute inset-0 bottom-6 flex flex-col justify-between pointer-events-none">
              {gridSteps.map((s) => (
                <div key={s} className="border-t border-stone-100 dark:border-stone-800" />
              ))}
            </div>

            {months.map((m, i) => (
              <div key={m.month} className="relative flex-1 h-full flex flex-col justify-end items-center group">
                {hovered === i && <Tooltip label={monthLabel(m.month)} value={fmtFull(m.total)} />}
                <div
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  className="w-full flex flex-col items-center justify-end h-[calc(100%-1.5rem)] cursor-default outline-none"
                >
                  <div
                    className={`w-full max-w-[24px] rounded-t-[4px] transition-colors ${BAR_BG} ${BAR_BG_HOVER}`}
                    style={{ height: `${Math.max((m.total / max) * 100, m.total > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className="h-6 pt-1 text-[11px] text-stone-400 dark:text-stone-500 whitespace-nowrap">
                  {monthLabel(m.month)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryBreakdownChart({ receipts }: { receipts: Receipt[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const categories = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of receipts) {
      totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount)
    }
    return [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  }, [receipts])

  if (categories.length === 0) return null

  const max = Math.max(...categories.map((c) => c.total))

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">Spending by Category</h3>
        <TableToggle showTable={showTable} onToggle={() => setShowTable((s) => !s)} />
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wide">
              <th className="pb-2 font-semibold">Category</th>
              <th className="pb-2 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {categories.map((c) => (
              <tr key={c.category}>
                <td className="py-1.5 text-stone-700 dark:text-stone-300">{c.category}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-900 dark:text-stone-100">{fmtFull(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col gap-2.5">
          {categories.map((c, i) => (
            <div key={c.category} className="relative flex items-center gap-3 group">
              <span className="w-36 shrink-0 text-xs text-stone-600 dark:text-stone-400 truncate" title={c.category}>
                {c.category}
              </span>
              <div className="relative flex-1 h-5">
                {hovered === i && <Tooltip label={c.category} value={fmtFull(c.total)} />}
                <div
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  className="h-full flex items-center cursor-default outline-none"
                  style={{ width: `${Math.max((c.total / max) * 100, 2)}%`, minWidth: '4px' }}
                >
                  <div className={`h-full max-h-[20px] w-full rounded-r-[4px] transition-colors ${BAR_BG} ${BAR_BG_HOVER}`} />
                </div>
              </div>
              <span className="w-20 shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400 text-right">
                {fmtFull(c.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SpendingCharts({ receipts }: { receipts: Receipt[] }) {
  if (receipts.length === 0) return null

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
          Spending Overview
        </h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MonthlyTrendChart receipts={receipts} />
        <CategoryBreakdownChart receipts={receipts} />
      </div>
    </section>
  )
}

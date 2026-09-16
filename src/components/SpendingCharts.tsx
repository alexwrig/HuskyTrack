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
const COLUMN_WIDTH = 40 // px, fixed per-month column so labels never fight for space

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

function ExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-[#4B2E83] dark:hover:text-purple-400 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition-all"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 101.06 1.06zM2 17.25v-4.5a.75.75 0 011.5 0v2.69l3.22-3.22a.75.75 0 111.06 1.06L4.56 16.5h2.69a.75.75 0 010 1.5h-4.5a.747.747 0 01-.75-.75z" clipRule="evenodd" />
      </svg>
    </button>
  )
}

function ChartModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
      <div className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 w-full max-w-3xl max-h-[85vh] overflow-y-auto flex flex-col gap-0 animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-4 sticky top-0 bg-white dark:bg-stone-900">
          <h2 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function SegmentedControl<T extends string>(
  { options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void },
) {
  return (
    <div className="inline-flex items-center rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5 text-xs shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md font-medium active:scale-95 transition-all ${
            value === opt.value
              ? 'bg-white dark:bg-stone-700 text-[#4B2E83] dark:text-purple-300 shadow-sm'
              : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Monthly Spending: bar / line / table ─────────────────────────────────────

type MonthlyMode = 'bar' | 'line' | 'table'

function MonthlyBarView({ months, max, gridSteps, monthLabel, size = 'default' }: {
  months: { month: string; total: number }[]
  max: number
  gridSteps: number[]
  monthLabel: (m: string) => string
  size?: 'default' | 'large'
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const heightClass = size === 'large' ? 'h-96' : 'h-48'

  return (
    <div className="flex gap-4">
      <div className={`flex flex-col justify-between ${heightClass} text-xs text-stone-400 dark:text-stone-500 text-right tabular-nums pb-6 shrink-0`}>
        {gridSteps.map((s) => <span key={s}>{fmt(max * s)}</span>)}
      </div>

      {/* Scrollable plot area -- fixed-width columns mean labels never force
          the row wider than the card; if there are enough months to not
          fit, this scrolls internally instead of spilling out of the card. */}
      <div className={`relative flex-1 ${heightClass} overflow-x-auto`}>
        <div
          className="relative h-full flex items-end gap-2 w-full"
          style={{ minWidth: `${months.length * (COLUMN_WIDTH + 8)}px` }}
        >
          <div className="absolute inset-0 bottom-6 flex flex-col justify-between pointer-events-none">
            {gridSteps.map((s) => (
              <div key={s} className="border-t border-stone-100 dark:border-stone-800" />
            ))}
          </div>

          {months.map((m, i) => (
            <div key={m.month} className="relative shrink-0 h-full flex flex-col justify-end items-center group" style={{ width: COLUMN_WIDTH }}>
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
                  className={`w-full max-w-[24px] rounded-t-[4px] transition-colors animate-grow-y ${BAR_BG} ${BAR_BG_HOVER}`}
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
    </div>
  )
}

function MonthlyLineView({ months, max, gridSteps, monthLabel, size = 'default' }: {
  months: { month: string; total: number }[]
  max: number
  gridSteps: number[]
  monthLabel: (m: string) => string
  size?: 'default' | 'large'
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const isLarge = size === 'large'
  const heightClass = isLarge ? 'h-96' : 'h-48'
  const w = Math.max(months.length * 50, 240)
  const h = isLarge ? 440 : 220
  const padBottom = isLarge ? 32 : 28
  const plotH = h - padBottom
  const stepX = months.length > 1 ? w / (months.length - 1) : 0

  const points = months.map((m, i) => ({
    x: months.length > 1 ? i * stepX : w / 2,
    y: plotH - Math.max(m.total, 0) / max * plotH,
    m,
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${plotH} L ${points[0].x.toFixed(1)} ${plotH} Z`

  return (
    <div className="flex gap-4">
      <div className="flex flex-col justify-between text-xs text-stone-400 dark:text-stone-500 text-right tabular-nums shrink-0" style={{ height: plotH }}>
        {gridSteps.map((s) => <span key={s}>{fmt(max * s)}</span>)}
      </div>

      <div className={`relative flex-1 ${heightClass} overflow-x-auto`}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className={`block ${heightClass}`}
          style={{ width: months.length > 6 ? w : '100%' }}
        >
          {gridSteps.map((s) => (
            <line key={s} x1={0} x2={w} y1={plotH - s * plotH} y2={plotH - s * plotH} strokeWidth={1} className="stroke-stone-100 dark:stroke-stone-800" />
          ))}
          <path d={areaPath} className="fill-[#4B2E83]/10 dark:fill-purple-400/10" />
          <path
            d={linePath}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            className="stroke-[#4B2E83] dark:stroke-purple-400 animate-draw-line"
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hovered === i ? 5 : 3.5}
                className="fill-[#4B2E83] dark:fill-purple-400 cursor-pointer transition-[r]"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{monthLabel(p.m.month)}: {fmtFull(p.m.total)}</title>
              </circle>
              <text x={p.x} y={h - 8} textAnchor="middle" className="fill-stone-400 dark:fill-stone-500 text-[11px]">
                {monthLabel(p.m.month)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function MonthlyTableView({ months, monthLabel }: { months: { month: string; total: number }[]; monthLabel: (m: string) => string }) {
  return (
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
  )
}

function MonthlyTrendChart({ receipts }: { receipts: Receipt[] }) {
  const [mode, setMode] = useState<MonthlyMode>('bar')
  const [expanded, setExpanded] = useState(false)

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
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'table', label: 'Table' }]}
          />
          <ExpandButton onClick={() => setExpanded(true)} label="Expand chart" />
        </div>
      </div>

      <div key={mode} className="animate-fade-in">
        {mode === 'bar' && <MonthlyBarView months={months} max={max} gridSteps={gridSteps} monthLabel={monthLabel} />}
        {mode === 'line' && <MonthlyLineView months={months} max={max} gridSteps={gridSteps} monthLabel={monthLabel} />}
        {mode === 'table' && <MonthlyTableView months={months} monthLabel={monthLabel} />}
      </div>

      {expanded && (
        <ChartModal title="Monthly Spending" onClose={() => setExpanded(false)}>
          {mode === 'bar' && <MonthlyBarView months={months} max={max} gridSteps={gridSteps} monthLabel={monthLabel} size="large" />}
          {mode === 'line' && <MonthlyLineView months={months} max={max} gridSteps={gridSteps} monthLabel={monthLabel} size="large" />}
          {mode === 'table' && <MonthlyTableView months={months} monthLabel={monthLabel} />}
        </ChartModal>
      )}
    </div>
  )
}

// ── Spending by Category: bar / donut / table ────────────────────────────────

type CategoryMode = 'bar' | 'donut' | 'table'

function categoryOpacity(i: number, count: number): number {
  if (count <= 1) return 1
  return Math.max(1 - i * (0.65 / (count - 1)), 0.35)
}

function CategoryBarView({ categories, max }: { categories: { category: string; total: number }[]; max: number }) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
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
              <div className={`h-full max-h-[20px] w-full rounded-r-[4px] transition-colors animate-grow-x ${BAR_BG} ${BAR_BG_HOVER}`} />
            </div>
          </div>
          <span className="w-20 shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400 text-right">
            {fmtFull(c.total)}
          </span>
        </div>
      ))}
    </div>
  )
}

function CategoryDonutView({ categories, total, size = 'default' }: { categories: { category: string; total: number }[]; total: number; size?: 'default' | 'large' }) {
  const isLarge = size === 'large'
  const svgSize = isLarge ? 320 : 180
  const r = isLarge ? 120 : 66
  const cx = svgSize / 2
  const cy = svgSize / 2
  const strokeWidth = isLarge ? 42 : 26
  const circumference = 2 * Math.PI * r

  let acc = 0
  const segments = categories.map((c, i) => {
    const frac = total > 0 ? c.total / total : 0
    const dash = frac * circumference
    const offset = -acc
    acc += dash
    return { ...c, dash, offset, opacity: categoryOpacity(i, categories.length) }
  })

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox={`0 0 ${svgSize} ${svgSize}`} className={`${isLarge ? 'w-72 h-72' : 'w-44 h-44'} shrink-0 -rotate-90 animate-scale-in`}>
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-stone-100 dark:stroke-stone-800" />
        {segments.map((s) => (
          <circle
            key={s.category}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
            style={{ opacity: s.opacity }}
            className="stroke-[#4B2E83] dark:stroke-purple-400"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 flex-1 min-w-40">
        {segments.map((s) => (
          <div key={s.category} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-[#4B2E83] dark:bg-purple-400" style={{ opacity: s.opacity }} />
            <span className="text-stone-600 dark:text-stone-400 flex-1 truncate" title={s.category}>{s.category}</span>
            <span className="text-stone-900 dark:text-stone-100 font-medium tabular-nums">{fmtFull(s.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryTableView({ categories }: { categories: { category: string; total: number }[] }) {
  return (
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
  )
}

function CategoryBreakdownChart({ receipts }: { receipts: Receipt[] }) {
  const [mode, setMode] = useState<CategoryMode>('bar')
  const [expanded, setExpanded] = useState(false)

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
  const total = categories.reduce((s, c) => s + c.total, 0)

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">Spending by Category</h3>
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[{ value: 'bar', label: 'Bar' }, { value: 'donut', label: 'Donut' }, { value: 'table', label: 'Table' }]}
          />
          <ExpandButton onClick={() => setExpanded(true)} label="Expand chart" />
        </div>
      </div>

      <div key={mode} className="animate-fade-in">
        {mode === 'bar' && <CategoryBarView categories={categories} max={max} />}
        {mode === 'donut' && <CategoryDonutView categories={categories} total={total} />}
        {mode === 'table' && <CategoryTableView categories={categories} />}
      </div>

      {expanded && (
        <ChartModal title="Spending by Category" onClose={() => setExpanded(false)}>
          {mode === 'bar' && <CategoryBarView categories={categories} max={max} />}
          {mode === 'donut' && <CategoryDonutView categories={categories} total={total} size="large" />}
          {mode === 'table' && <CategoryTableView categories={categories} />}
        </ChartModal>
      )}
    </div>
  )
}

export function SpendingCharts({ receipts, isFiltered = false }: { receipts: Receipt[]; isFiltered?: boolean }) {
  if (receipts.length === 0 && !isFiltered) return null

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
          Spending Overview{isFiltered ? ' (filtered)' : ''}
        </h2>
      </div>
      {receipts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-800 px-5 py-10 text-center text-sm text-stone-400 dark:text-stone-600">
          No spending matches the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
          <MonthlyTrendChart receipts={receipts} />
          <CategoryBreakdownChart receipts={receipts} />
        </div>
      )}
    </section>
  )
}

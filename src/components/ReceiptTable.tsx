'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { CategoryBadge } from './CategoryBadge'
import { EXPENSE_CATEGORIES, SUB_PURPOSE_MAP } from '../types'
import type { Receipt, ExpenseCategory, ReceiptUpdate } from '../types'

interface Props {
  receipts: Receipt[]
  onDelete: (id: string) => void
  onUpdate: (id: string, update: ReceiptUpdate) => Promise<void>
}

interface EditState {
  id: string
  field: string
  value: string
}

function EditableCell({ children, onEdit }: { children: React.ReactNode; onEdit: () => void }) {
  return (
    <div
      onClick={onEdit}
      className="cursor-pointer rounded px-1 -mx-1 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group relative"
      title="Click to edit"
    >
      {children}
      <span className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="h-3 w-3 text-stone-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
        </svg>
      </span>
    </div>
  )
}

export function ReceiptTable({ receipts, onDelete, onUpdate }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (!edit || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    if (edit.field === 'date' && el instanceof HTMLInputElement && typeof el.showPicker === 'function') {
      try { el.showPicker() } catch { /* not supported in all browsers */ }
    }
  }, [edit])

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

  const startEdit = (id: string, field: string, value: string) => {
    setEdit({ id, field, value })
  }

  const cancelEdit = () => setEdit(null)

  const commitEdit = async () => {
    if (!edit || saving) return
    const receipt = receipts.find((r) => r.id === edit.id)
    if (!receipt) { cancelEdit(); return }

    let update: ReceiptUpdate = {}
    switch (edit.field) {
      case 'date':      update = { date: edit.value }; break
      case 'merchant':  update = { merchant: edit.value.trim() || receipt.merchant }; break
      case 'amount': {
        const n = parseFloat(edit.value)
        update = { amount: isNaN(n) ? receipt.amount : n }
        break
      }
      case 'category':
        update = { category: edit.value as ExpenseCategory, purpose_sub: null }
        break
      case 'purpose_sub':
        update = { purpose_sub: edit.value || null }
        break
      case 'card_last_four':
        update = { card_last_four: edit.value.replace(/\D/g, '').slice(0, 4) || null }
        break
    }

    setSaving(true)
    setEdit(null)
    await onUpdate(edit.id, update)
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  const inputClass = 'w-full rounded border border-[#4B2E83] bg-white dark:bg-stone-900 px-1.5 py-0.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#4B2E83]'

  const renderCell = (r: Receipt, field: string) => {
    const isEditing = edit?.id === r.id && edit?.field === field

    if (isEditing) {
      if (field === 'category') {
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className={inputClass}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )
      }
      if (field === 'purpose_sub') {
        const cat = (r.category as ExpenseCategory)
        const opts = SUB_PURPOSE_MAP[cat] ?? ['Other']
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className={inputClass}
          >
            <option value="">None</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      }
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={field === 'date' ? 'date' : field === 'amount' ? 'number' : 'text'}
          step={field === 'amount' ? '0.01' : undefined}
          maxLength={field === 'card_last_four' ? 4 : undefined}
          value={edit.value}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
      )
    }

    switch (field) {
      case 'date':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'date', r.date)}>
            <span className="text-stone-500 dark:text-stone-400 tabular-nums">{r.date}</span>
          </EditableCell>
        )
      case 'merchant':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'merchant', r.merchant)}>
            <span className="font-medium text-stone-900 dark:text-stone-100">{r.merchant}</span>
          </EditableCell>
        )
      case 'amount':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'amount', String(r.amount))}>
            <span className="text-stone-900 dark:text-stone-100 tabular-nums font-medium">{fmt(r.amount)}</span>
          </EditableCell>
        )
      case 'category':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'category', r.category)}>
            <CategoryBadge category={r.category as ExpenseCategory} />
          </EditableCell>
        )
      case 'purpose_sub':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'purpose_sub', r.purpose_sub ?? '')}>
            <span className="text-stone-400 dark:text-stone-500">{r.purpose_sub ?? '—'}</span>
          </EditableCell>
        )
      case 'card_last_four':
        return (
          <EditableCell onEdit={() => startEdit(r.id, 'card_last_four', r.card_last_four ?? '')}>
            <span className="text-stone-400 dark:text-stone-500 tabular-nums">
              {r.card_last_four ? `••••${r.card_last_four}` : '—'}
            </span>
          </EditableCell>
        )
      default:
        return null
    }
  }

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
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{renderCell(r, 'date')}</td>
                  <td className="px-4 py-3 max-w-48">{renderCell(r, 'merchant')}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{renderCell(r, 'amount')}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{renderCell(r, 'category')}</td>
                  <td className="px-4 py-3 max-w-36">{renderCell(r, 'purpose_sub')}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{renderCell(r, 'card_last_four')}</td>
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

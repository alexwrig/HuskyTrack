'use client'

import { useState } from 'react'
import { EXPENSE_CATEGORIES } from '../types'
import type { ReviewItem, ReceiptCreate, ExpenseCategory } from '../types'

interface Props {
  items: ReviewItem[]
  onApprove: (id: string, receipt: ReceiptCreate) => Promise<void>
  onDiscard: (id: string) => Promise<void>
}

type Draft = {
  date: string
  merchant: string
  amount: string
  category: ExpenseCategory
  city: string
  state: string
}

function draftFromItem(item: ReviewItem): Draft {
  const p = item.parsed
  return {
    date:     p?.date ?? new Date().toISOString().slice(0, 10),
    merchant: p?.merchant ?? '',
    amount:   p?.amount != null ? String(p.amount) : '',
    category: p?.suggested_category ?? 'Other',
    city:     p?.city ?? '',
    state:    p?.state ?? '',
  }
}

function ReviewCard({ item, onApprove, onDiscard }: { item: ReviewItem; onApprove: Props['onApprove']; onDiscard: Props['onDiscard'] }) {
  const [draft, setDraft] = useState<Draft>(() => draftFromItem(item))
  const [busy, setBusy] = useState(false)

  const isImage = item.mime_type?.startsWith('image/')
  const isPdf = item.mime_type === 'application/pdf'
  const dataUri = item.file_base64 && item.mime_type ? `data:${item.mime_type};base64,${item.file_base64}` : null

  const handleApprove = async () => {
    const amount = parseFloat(draft.amount)
    if (!draft.merchant.trim() || isNaN(amount)) return
    setBusy(true)
    await onApprove(item.id, {
      date: draft.date,
      merchant: draft.merchant.trim(),
      amount,
      category: draft.category,
      purpose_sub: null,
      purpose: null,
      card_last_four: null,
      city: draft.city.trim() || null,
      state: draft.state.trim().toUpperCase().slice(0, 2) || null,
    })
    setBusy(false)
  }

  const handleDiscard = async () => {
    setBusy(true)
    await onDiscard(item.id)
    setBusy(false)
  }

  const inputClass = 'w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors'

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
            {item.subject || '(no subject)'}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            From {item.from_address ?? 'unknown'} · {new Date(item.received_at).toLocaleString()}
          </p>
        </div>
        {item.file_name && (
          <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500 truncate max-w-40">{item.file_name}</span>
        )}
      </div>

      <p className="text-xs text-amber-700 dark:text-amber-400">{item.reason}</p>

      {dataUri && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUri} alt={item.file_name ?? 'attachment'} className="max-h-40 w-auto rounded-lg border border-stone-200 dark:border-stone-800" />
      )}
      {dataUri && isPdf && (
        <a href={dataUri} target="_blank" rel="noopener noreferrer" className="text-sm text-[#4B2E83] dark:text-purple-400 underline w-fit">
          View PDF attachment
        </a>
      )}
      {!dataUri && item.email_text && (
        <p className="text-xs text-stone-500 dark:text-stone-400 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 p-2.5 max-h-24 overflow-y-auto whitespace-pre-wrap">
          {item.email_text.slice(0, 500)}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inputClass} />
        <input type="text" placeholder="Merchant" value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} className={`${inputClass} col-span-2 sm:col-span-1`} />
        <input type="number" step="0.01" placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className={inputClass} />
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })} className={`${inputClass} col-span-2 sm:col-span-1`}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={inputClass} />
        <input type="text" placeholder="State" maxLength={2} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} className={inputClass} />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={handleDiscard}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
        <button
          onClick={handleApprove}
          disabled={busy || !draft.merchant.trim() || isNaN(parseFloat(draft.amount))}
          className="px-3 py-1.5 rounded-lg bg-[#4B2E83] text-sm font-medium text-white hover:bg-[#3d2569] transition-colors disabled:opacity-50"
        >
          Approve
        </button>
      </div>
    </div>
  )
}

export function ReviewQueue({ items, onApprove, onDiscard }: Props) {
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
          Needs Review
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          {items.length} forwarded {items.length === 1 ? 'email' : 'emails'} couldn&apos;t be auto-imported. Check the details and approve or discard.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <ReviewCard key={item.id} item={item} onApprove={onApprove} onDiscard={onDiscard} />
        ))}
      </div>
    </section>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlaidTransactionDetails, UnifiedTransaction } from '../types'

interface PlaidInfo {
  details: PlaidTransactionDetails | null
  merchant: string
  merchant_edited: boolean
  account: { name: string; mask: string | null; subtype: string | null; institution_name: string | null } | null
}

interface Props {
  transaction: UnifiedTransaction
  onClose: () => void
}

// "FOOD_AND_DRINK_RESTAURANT" under primary "FOOD_AND_DRINK" -> "Restaurant"
function humanize(code: string | null, stripPrefix?: string | null): string | null {
  if (!code) return null
  const trimmed = stripPrefix && code.startsWith(`${stripPrefix}_`) ? code.slice(stripPrefix.length + 1) : code
  const words = trimmed.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1">
      <span className="text-stone-500 dark:text-stone-400">{label}</span>
      <span className="text-stone-900 dark:text-stone-100 break-words">{value}</span>
    </div>
  )
}

function NameRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="py-1.5">
      <p className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-stone-500">{label}</p>
      <p className="font-mono text-[13px] text-stone-900 dark:text-stone-100 break-all">{value}</p>
    </div>
  )
}

// Read-only view of what the bank/card sent Plaid for one synced charge.
export function TransactionInfoModal({ transaction: t, onClose }: Props) {
  const [info, setInfo] = useState<PlaidInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    fetch(`/api/plaid/transactions/${t.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as PlaidInfo & { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Failed to load bank details')
        setInfo(data)
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Failed to load bank details'))
  }, [t.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const d = info?.details
  const location = d
    ? [d.location.address, d.location.city, d.location.region, d.location.postal_code].filter(Boolean).join(', ')
    : null
  const account = info?.account
    ? [info.account.institution_name, `${info.account.name}${info.account.mask ? ` ••${info.account.mask}` : ''}`].filter(Boolean).join(' · ')
    : null

  // Portaled to <body>: the table sits inside an animated (transformed)
  // section, which would otherwise make this "fixed" overlay position
  // relative to the table instead of the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-info-title"
        className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
      >
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="txn-info-title" className="font-display text-lg font-bold text-stone-900 dark:text-stone-100 break-words">{t.merchant}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {t.date} · ${t.amount.toFixed(2)}
              {info?.merchant_edited && ' · renamed by you'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-5 text-sm">
          {!info && !loadError && <p className="text-stone-400">Loading bank details...</p>}
          {loadError && <p role="alert" className="text-red-600 dark:text-red-400">{loadError}</p>}
          {info && !d && (
            <p className="text-stone-500 dark:text-stone-400">
              No bank details stored for this charge yet. They&apos;re saved on the next sync of it.
            </p>
          )}

          {d && (
            <>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Names from the bank</h3>
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  <NameRow label="Original bank description" value={d.original_description} />
                  <NameRow label="Plaid cleaned-up name" value={d.name} />
                  <NameRow label="Plaid merchant" value={d.merchant_name} />
                  {d.counterparties
                    .filter((c) => c.name !== d.merchant_name)
                    .map((c) => (
                      <NameRow key={`${c.type}-${c.name}`} label={`Counterparty (${humanize(c.type)})`} value={c.name} />
                    ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Details</h3>
                <Row label="Plaid category" value={[humanize(d.category_primary), humanize(d.category_detailed, d.category_primary)].filter(Boolean).join(' › ')} />
                <Row label="Category confidence" value={humanize(d.category_confidence)} />
                <Row label="Account" value={account} />
                <Row label="Channel" value={humanize(d.payment_channel)} />
                <Row label="Authorized" value={d.authorized_date} />
                <Row label="Posted" value={d.pending ? 'Pending' : d.date} />
                <Row label="Time" value={d.datetime ? new Date(d.datetime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' }) : null} />
                <Row label="Location" value={location} />
                <Row label="Store number" value={d.location.store_number} />
                <Row label="Website" value={d.website} />
                <Row label="Currency" value={d.iso_currency_code} />
                <Row label="Transaction ID" value={d.transaction_id} />
              </section>

              <section>
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="text-xs font-medium text-[#4B2E83] dark:text-purple-400 hover:underline"
                >
                  {showRaw ? 'Hide raw data' : 'Show raw data'}
                </button>
                {showRaw && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 p-3 text-[11px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {JSON.stringify(d, null, 2)}
                  </pre>
                )}
              </section>
            </>
          )}

        </div>
      </div>
    </div>,
    document.body,
  )
}

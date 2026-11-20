'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EmailReceipt } from '@/src/types'

interface InboxState {
  connected: boolean
  connection_error: string | null
  inbox_address: string
  watching: boolean
  auto_parse: boolean
  last_checked_at: string | null
  can_manage: boolean
  items: EmailReceipt[]
}

interface Props {
  // Called whenever receipts or review items may have changed.
  onChanged: () => void
}

const TZ = 'America/Los_Angeles'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const sameDay = d.toLocaleDateString('en-US', { timeZone: TZ }) === new Date().toLocaleDateString('en-US', { timeZone: TZ })
  return d.toLocaleString('en-US', sameDay
    ? { hour: 'numeric', minute: '2-digit', timeZone: TZ }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

// YYYY-MM-DD in Pacific time.
function isoDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
}

// "Instacart <orders@instacart.com>" -> "Instacart"
function senderName(from: string | null): string {
  if (!from) return 'Unknown sender'
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)
  return (m && m[1]) || from.replace(/[<>]/g, '')
}

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const MailIcon = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
    <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
  </svg>
)

function StatusBadge({ item }: { item: EmailReceipt }) {
  if (item.status === 'parsed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400" title={item.detail ?? undefined}>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
        Parsed{item.amount != null ? ` · ${formatAmount(item.amount)}` : ''}
      </span>
    )
  }
  if (item.status === 'review') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400" title={item.detail ?? undefined}>
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Needs review{item.amount != null ? ` · ${formatAmount(item.amount)} added` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
      Waiting to parse
    </span>
  )
}

export function EmailReceipts({ onChanged }: Props) {
  const [state, setState] = useState<InboxState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email-receipts')
      const data = await res.json().catch(() => ({})) as Partial<InboxState> & { error?: string }
      if (!res.ok || !data.items) throw new Error(data.error ?? 'Failed to load email receipts')
      setState(data as InboxState)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load email receipts')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const checkInbox = async () => {
    setChecking(true)
    setMessage(null)
    try {
      const res = await fetch('/api/email-receipts/check', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { parsed?: number; needs_review?: number; remaining?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to check inbox')
      const parsed = data.parsed ?? 0
      const review = data.needs_review ?? 0
      const parts: string[] = []
      if (parsed > 0) parts.push(`${parsed} parsed`)
      if (review > 0) parts.push(`${review} sent to Needs Review`)
      if (data.remaining) parts.push(`${data.remaining} more waiting, check again to continue`)
      setMessage({ isError: false, text: parts.length > 0 ? `${parts.join(', ')}.` : 'No new receipt emails.' })
      if (parsed + review > 0) onChanged()
    } catch (err) {
      setMessage({ isError: true, text: err instanceof Error ? err.message : 'Failed to check inbox' })
    } finally {
      setChecking(false)
      load()
    }
  }

  const toggleAutoParse = async () => {
    if (!state) return
    const next = !state.auto_parse
    setSavingToggle(true)
    setState({ ...state, auto_parse: next })
    try {
      const res = await fetch('/api/email-receipts/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auto_parse: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Failed to save setting')
      }
    } catch (err) {
      setState((s) => s && { ...s, auto_parse: !next })
      setMessage({ isError: true, text: err instanceof Error ? err.message : 'Failed to save setting' })
    } finally {
      setSavingToggle(false)
    }
  }

  const statusLine = state && [
    state.last_checked_at ? `Checked ${formatTime(state.last_checked_at)}` : 'Not checked yet',
    state.connected && state.watching && state.auto_parse ? 'watching for new receipts' : null,
    state.connected && !state.auto_parse ? 'auto-parse off' : null,
  ].filter(Boolean).join(' · ')

  return (
    <section className="flex flex-col gap-5 animate-fade-in-up">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
            Email Receipts
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Receipt emails in your inbox are found and parsed automatically.
          </p>
        </div>
        {state && (
          <div className="flex items-center gap-4">
            <label className={`inline-flex items-center gap-2.5 whitespace-nowrap text-sm text-stone-600 dark:text-stone-300 ${state.can_manage ? 'cursor-pointer' : 'opacity-60'}`}
              title={state.can_manage ? undefined : 'Only the admin can change this'}>
              <button
                type="button"
                role="switch"
                aria-checked={state.auto_parse}
                onClick={toggleAutoParse}
                disabled={!state.can_manage || savingToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
                  state.auto_parse ? 'bg-[#4B2E83] dark:bg-purple-600' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${state.auto_parse ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              Auto-parse
            </label>
            <button
              onClick={checkInbox}
              disabled={checking || !state.connected}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {checking ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : <MailIcon className="h-4 w-4" />}
              {checking ? 'Checking...' : 'Check inbox'}
            </button>
          </div>
        )}
      </div>

      {message && (
        <p role={message.isError ? 'alert' : 'status'} className={`text-sm ${message.isError ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}>
          {message.text}
        </p>
      )}
      {loadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {state && (
        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/40 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 sm:px-5 py-3.5 bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2.5">
              <MailIcon className="h-4 w-4 text-[#4B2E83] dark:text-purple-300" />
              <span className="text-sm font-medium text-stone-900 dark:text-stone-100">UW email</span>
              {state.connected ? (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Connected
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                  title={state.connection_error ?? undefined}>
                  Not connected
                </span>
              )}
            </div>
            <span className="text-xs text-stone-500 dark:text-stone-400">{statusLine}</span>
          </div>

          {state.items.length === 0 ? (
            <p className="px-4 sm:px-5 py-6 text-sm text-stone-500 dark:text-stone-400">
              No receipt emails yet. Forward receipts from your UW email to{' '}
              <span className="font-medium text-stone-700 dark:text-stone-300">{state.inbox_address}</span>
              {' '}(an Outlook inbox rule can do this automatically), then check the inbox.
            </p>
          ) : (
            <ul className="divide-y divide-stone-200 dark:divide-stone-800">
              {state.items.map((item) => (
                <li key={item.message_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 sm:px-5 py-3.5">
                  <div className="min-w-48 flex-1">
                    <p className="flex items-baseline gap-2.5">
                      <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                        {item.merchant ?? senderName(item.from_address)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-stone-400 dark:text-stone-500">
                        {item.receipt_date ?? isoDate(item.received_at)}
                      </span>
                    </p>
                    <p className="truncate text-sm text-stone-500 dark:text-stone-400">{item.subject ?? '(no subject)'}</p>
                  </div>
                  <StatusBadge item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

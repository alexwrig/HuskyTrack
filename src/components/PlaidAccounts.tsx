'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PlaidItemStatus } from '@/src/types'
import { PlaidLinkButton } from './PlaidLinkButton'
import { describeApiError, requestSync, usePlaidLinkFlow } from './usePlaidLinkFlow'

interface LinkedItem {
  id: string
  institution_name: string | null
  status: PlaidItemStatus
  error_code: string | null
  last_synced_at: string | null
  accounts: { id: string; name: string; mask: string | null; subtype: string | null }[]
}

interface Props {
  // Called whenever transactions may have changed (link, sync, remove).
  onChanged: () => void
}

function formatSyncedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short',
  })
}

function statusText(item: LinkedItem): string {
  if (item.status === 'login_required') return 'Needs reconnecting'
  if (item.status === 'error') return `Error${item.error_code ? `: ${item.error_code}` : ''}`
  return item.last_synced_at ? `Synced ${formatSyncedAt(item.last_synced_at)}` : 'Not synced yet'
}

function ReconnectButton({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const { launch, status, busy, error } = usePlaidLinkFlow({ itemId, onComplete: onDone })
  return (
    <>
      <button
        onClick={launch}
        disabled={busy}
        className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
      >
        {status ?? 'Reconnect'}
      </button>
      {error && <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </>
  )
}

function ItemRow({ item, canManage, onChanged }: { item: LinkedItem; canManage: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/plaid/items/${item.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({})) as { error?: string; error_code?: string | null }
      if (!res.ok) throw new Error(describeApiError(data, 'Failed to remove account'))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove account')
      setRemoving(false)
      setConfirming(false)
    }
  }

  const statusColor = item.status === 'ok'
    ? 'text-stone-500 dark:text-stone-400'
    : 'text-amber-700 dark:text-amber-400'

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex-1 min-w-48">
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {item.institution_name ?? 'Linked institution'}
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {item.accounts.length > 0
            ? item.accounts.map((a) => `${a.name}${a.mask ? ` ••${a.mask}` : ''}`).join(', ')
            : 'Accounts appear after the first sync'}
        </p>
      </div>
      <span className={`text-xs ${statusColor}`}>{statusText(item)}</span>
      {canManage && <div className="flex items-center gap-2">
        {item.status === 'login_required' && <ReconnectButton itemId={item.id} onDone={onChanged} />}
        {confirming ? (
          <>
            <button
              onClick={remove}
              disabled={removing}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove account and its transactions'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={removing}
              className="rounded-md px-2.5 py-1 text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-md border border-stone-300 dark:border-stone-700 px-2.5 py-1 text-xs text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        )}
      </div>}
      {error && <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  )
}

export function PlaidAccounts({ onChanged }: Props) {
  const [items, setItems] = useState<LinkedItem[] | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch('/api/plaid/items')
      const data = await res.json().catch(() => ({})) as { items?: LinkedItem[]; can_manage?: boolean; error?: string }
      if (!res.ok || !data.items) throw new Error(data.error ?? 'Failed to load linked accounts')
      setItems(data.items)
      setCanManage(Boolean(data.can_manage))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load linked accounts')
    }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  const refresh = useCallback(() => {
    loadItems()
    onChanged()
  }, [loadItems, onChanged])

  const syncNow = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const data = await requestSync()
      const failures = (data.items ?? []).filter((i) => !i.ok)
      setSyncMessage(failures.length > 0
        ? {
            isError: true,
            text: failures.map((f) => `${f.institution_name ?? 'Account'}: ${describeApiError(f, 'sync failed')}`).join('; '),
          }
        : { isError: false, text: 'Up to date.' })
    } catch (err) {
      setSyncMessage({ isError: true, text: err instanceof Error ? err.message : 'Sync failed' })
    } finally {
      setSyncing(false)
      refresh()
    }
  }

  const hasItems = (items?.length ?? 0) > 0

  return (
    <section className="flex flex-col gap-5 animate-fade-in-up">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
            Bank Accounts &amp; Cards
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Connect a bank account, credit, or debit card to sync spending automatically.
          </p>
        </div>
        <div className="flex items-end gap-3">
          {hasItems && (
            <button
              onClick={syncNow}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
          )}
          {canManage && <PlaidLinkButton onLinked={refresh} />}
        </div>
      </div>

      {syncMessage && (
        <p role={syncMessage.isError ? 'alert' : 'status'} className={`text-sm ${syncMessage.isError ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}>
          {syncMessage.text}
        </p>
      )}
      {loadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {hasItems && (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/40">
          {items!.map((item) => <ItemRow key={item.id} item={item} canManage={canManage} onChanged={refresh} />)}
        </ul>
      )}
    </section>
  )
}

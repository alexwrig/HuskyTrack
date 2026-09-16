'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { UploadZone } from '@/src/components/UploadZone'
import { ReceiptTable } from '@/src/components/ReceiptTable'
import type { ReceiptFilter } from '@/src/components/ReceiptTable'
import { InstructionsModal } from '@/src/components/InstructionsModal'
import { ExportConfirmModal } from '@/src/components/ExportConfirmModal'
import { ReviewQueue } from '@/src/components/ReviewQueue'
import { DuplicatesBanner } from '@/src/components/DuplicatesBanner'
import { SpendingCharts } from '@/src/components/SpendingCharts'
import { PlaidLinkButton } from '@/src/components/PlaidLinkButton'
import type { UnifiedTransaction, ReceiptUpdate, ReviewItem, ReceiptCreate, DuplicateGroup } from '@/src/types'

interface UploadResult {
  name: string
  count?: number
  error?: string
}

interface ProcessingState {
  active: boolean
  totalFiles: number
  added: number
  errors: string[]
}

async function sendFile(file: File, instructions: string): Promise<{ added: number; error?: string }> {
  const formData = new FormData()
  formData.append('files', file)
  if (instructions.trim()) formData.append('instructions', instructions.trim())
  try {
    const res = await fetch('/api/parse', { method: 'POST', body: formData })
    const data = await res.json() as { succeeded: UploadResult[]; failed: UploadResult[]; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Upload failed')
    const added = data.succeeded.reduce((s, r) => s + (r.count ?? 0), 0)
    const failed = data.failed[0]
    return { added, error: failed ? `${failed.name}: ${failed.error}` : undefined }
  } catch (err) {
    return { added: 0, error: err instanceof Error ? err.message : 'Failed' }
  }
}

export default function Home() {
  const [receipts, setReceipts] = useState<UnifiedTransaction[]>([])
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<ProcessingState>({
    active: false, totalFiles: 0, added: 0, errors: [],
  })
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [exportFilter, setExportFilter] = useState<ReceiptFilter>({ categories: [], cities: [], startDate: '', endDate: '' })
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyMessage, setReclassifyMessage] = useState<string | null>(null)

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await fetch('/api/receipts')
      if (!res.ok) throw new Error(await res.text())
      setReceipts(await res.json() as UnifiedTransaction[])
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchReviewItems = useCallback(async () => {
    try {
      const res = await fetch('/api/review')
      if (res.ok) setReviewItems(await res.json() as ReviewItem[])
    } catch {
      // Non-critical; the review queue simply stays empty if this fails.
    }
  }, [])

  const fetchDuplicates = useCallback(async () => {
    try {
      const res = await fetch('/api/duplicates')
      if (res.ok) setDuplicateGroups(await res.json() as DuplicateGroup[])
    } catch {
      // Non-critical; the duplicates banner simply stays hidden if this fails.
    }
  }, [])

  useEffect(() => { fetchReceipts(); fetchReviewItems(); fetchDuplicates() }, [fetchReceipts, fetchReviewItems, fetchDuplicates])

  const handleResolveDuplicates = async (groupsToResolve: DuplicateGroup[]) => {
    const res = await fetch('/api/duplicates/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groups: groupsToResolve }),
    })
    if (res.ok) {
      const resolvedKeys = new Set(groupsToResolve.map((g) => `${g.date}|${g.merchant}|${g.amount}`))
      setDuplicateGroups((prev) => prev.filter((g) => !resolvedKeys.has(`${g.date}|${g.merchant}|${g.amount}`)))
      await fetchReceipts()
    }
  }

  const handleReviewApprove = async (id: string, receipt: ReceiptCreate) => {
    const res = await fetch(`/api/review/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve', receipt }),
    })
    if (res.ok) {
      setReviewItems((prev) => prev.filter((r) => r.id !== id))
      await fetchReceipts()
    }
  }

  const handleReviewDiscard = async (id: string) => {
    const res = await fetch(`/api/review/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'discard' }),
    })
    if (res.ok) setReviewItems((prev) => prev.filter((r) => r.id !== id))
  }

  const handleUpload = async (files: File[]) => {
    setGlobalError(null)
    setProcessing({ active: true, totalFiles: files.length, added: 0, errors: [] })

    const results = await Promise.all(files.map((f) => sendFile(f, instructions)))
    const added = results.reduce((s, r) => s + r.added, 0)
    const errors = results.flatMap((r) => r.error ? [r.error] : [])

    setProcessing({ active: false, totalFiles: files.length, added, errors })
    await fetchReceipts()
    await fetchDuplicates()
  }

  const handleDelete = async (id: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id))
    try {
      await fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    } catch {
      await fetchReceipts()
    }
  }

  const handleUpdate = async (id: string, update: ReceiptUpdate) => {
    const res = await fetch(`/api/receipts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) {
      const updated = await res.json() as UnifiedTransaction
      setReceipts((prev) => prev.map((r) => r.id === id ? updated : r))
    }
  }

  const handleClearAll = async () => {
    const count = receipts.filter((r) => r.source === 'receipt').length
    if (!confirm('Delete all uploaded receipts and statement imports? This cannot be undone. Bank-synced transactions are not affected.')) return
    if (!confirm(`Are you sure? This will permanently delete ${count} ${count === 1 ? 'receipt' : 'receipts'}. There is no way to undo this.`)) return
    try {
      await fetch('/api/receipts', { method: 'DELETE' })
      // Re-fetch rather than clearing local state to [] -- the DELETE only
      // clears the manually-uploaded receipts table, not Plaid-synced
      // transactions, so any of those still need to remain visible.
      await fetchReceipts()
      await fetchDuplicates()
      setProcessing((p) => ({ ...p, active: false, added: 0, errors: [] }))
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to clear')
    }
  }

  const handleReclassifyOther = async () => {
    setReclassifying(true)
    setReclassifyMessage(null)
    try {
      const res = await fetch('/api/reclassify', { method: 'POST' })
      const data = await res.json() as { checked?: number; reclassified?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to reclassify')
      setReclassifyMessage(
        data.checked === 0
          ? 'Nothing categorized as "Other" right now.'
          : `Reclassified ${data.reclassified} of ${data.checked} "Other" ${data.checked === 1 ? 'transaction' : 'transactions'}.`,
      )
      if ((data.reclassified ?? 0) > 0) await fetchReceipts()
    } catch (err) {
      setReclassifyMessage(err instanceof Error ? err.message : 'Failed to reclassify')
    } finally {
      setReclassifying(false)
    }
  }

  // Charts reflect the same category/city/date filters applied in the
  // receipts table, so they update live as the user filters instead of
  // always showing the unfiltered totals.
  const chartsReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (exportFilter.categories.length > 0 && !exportFilter.categories.includes(r.category)) return false
      if (exportFilter.cities.length > 0 && (!r.city || !exportFilter.cities.includes(r.city))) return false
      if (exportFilter.startDate && r.date < exportFilter.startDate) return false
      if (exportFilter.endDate && r.date > exportFilter.endDate) return false
      return true
    })
  }, [receipts, exportFilter])

  return (
    <div className="flex flex-col gap-12">
      {showInstructions && (
        <InstructionsModal
          value={instructions}
          onChange={setInstructions}
          onClose={() => setShowInstructions(false)}
        />
      )}
      {showExportConfirm && (
        <ExportConfirmModal
          filter={exportFilter}
          onCancel={() => setShowExportConfirm(false)}
          onConfirm={() => {
            const params = new URLSearchParams()
            exportFilter.categories.forEach((c) => params.append('category', c))
            exportFilter.cities.forEach((c) => params.append('city', c))
            if (exportFilter.startDate) params.set('start_date', exportFilter.startDate)
            if (exportFilter.endDate) params.set('end_date', exportFilter.endDate)
            const qs = params.toString()
            window.open(`/api/export${qs ? `?${qs}` : ''}`, '_blank')
            setShowExportConfirm(false)
          }}
        />
      )}
      {/* Bank accounts / cards (Plaid) */}
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
          <PlaidLinkButton onLinked={() => { fetchReceipts(); fetchDuplicates() }} />
        </div>
      </section>

      {/* Upload section */}
      <section className="flex flex-col gap-5 animate-fade-in-up stagger-1">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
              Upload Receipts
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              Drop a spreadsheet and everything gets itemized automatically.
            </p>
          </div>
          {receipts.length > 0 && (
            <div className="flex items-center gap-3 shrink-0 pb-0.5">
              <button
                onClick={() => setShowExportConfirm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] transition-all shadow-sm"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 10.03a.75.75 0 111.06-1.06L9.25 11.44V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                  <path d="M3.5 16.25a.75.75 0 000 1.5h13a.75.75 0 000-1.5h-13z" />
                </svg>
                Export XLSX{(exportFilter.categories.length > 0 || exportFilter.cities.length > 0 || exportFilter.startDate || exportFilter.endDate) ? ' (filtered)' : ''}
              </button>
              <button
                onClick={() => window.open('/api/export-log', '_blank')}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 014.75 2h10.5A2.75 2.75 0 0118 4.75v10.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25V4.75zM5.5 7a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9zm0 3.5a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9zm0 3.5a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
                </svg>
                Export Log
              </button>
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-400 transition-colors"
              >
                Clear receipts
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <UploadZone onUpload={handleUpload} disabled={processing.active} />
          </div>
        </div>

        {/* Instructions button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInstructions(true)}
            className="inline-flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 hover:text-[#4B2E83] dark:hover:text-purple-400 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Parsing instructions
          </button>
          {instructions && (
            <span className="inline-flex items-center gap-1 text-xs text-[#4B2E83] dark:text-purple-400 font-medium">
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              Instructions set
            </span>
          )}
          <span className="text-stone-300 dark:text-stone-700">|</span>
          <button
            onClick={handleReclassifyOther}
            disabled={reclassifying}
            className="inline-flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 hover:text-[#4B2E83] dark:hover:text-purple-400 transition-colors disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${reclassifying ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            {reclassifying ? 'Reclassifying…' : 'Reclassify "Other"'}
          </button>
          {reclassifyMessage && (
            <span className="text-xs text-stone-500 dark:text-stone-400 animate-fade-in">{reclassifyMessage}</span>
          )}
        </div>

        {/* Live processing panel */}
        {processing.active && (
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm px-5 py-4 flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin text-[#4B2E83] dark:text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Processing {processing.totalFiles} {processing.totalFiles === 1 ? 'file' : 'files'}...
            </p>
          </div>
        )}

        {/* Post-upload summary */}
        {!processing.active && processing.totalFiles > 0 && (
          <div className={`rounded-xl px-5 py-4 text-sm border ${
            processing.errors.length === 0
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
          }`}>
            <p className="font-medium">
              {processing.added} {processing.added === 1 ? 'receipt' : 'receipts'} added from {processing.totalFiles} {processing.totalFiles === 1 ? 'file' : 'files'}.
            </p>
            {processing.errors.map((e, i) => (
              <p key={i} className="mt-1 text-xs opacity-75">{e}</p>
            ))}
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-5 py-4 text-sm text-red-700 dark:text-red-400">
            {globalError}
          </div>
        )}
      </section>

      <div className="animate-fade-in">
        <DuplicatesBanner groups={duplicateGroups} onResolve={handleResolveDuplicates} />
      </div>

      <ReviewQueue items={reviewItems} onApprove={handleReviewApprove} onDiscard={handleReviewDiscard} />

      <div className="animate-fade-in-up stagger-2">
        <SpendingCharts
          receipts={chartsReceipts}
          isFiltered={exportFilter.categories.length > 0 || exportFilter.cities.length > 0 || Boolean(exportFilter.startDate) || Boolean(exportFilter.endDate)}
        />
      </div>

      {/* Receipts section */}
      <section className="flex flex-col gap-5 animate-fade-in-up stagger-3">
        <div>
          <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
            Your Receipts
          </h2>
          {receipts.length > 0 && (
            <p className="text-sm text-stone-400 dark:text-stone-600 mt-1">
              {receipts.length} {receipts.length === 1 ? 'entry' : 'entries'} on record
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone-400 dark:text-stone-600 gap-2">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading...
          </div>
        ) : (
          <ReceiptTable receipts={receipts} onDelete={handleDelete} onUpdate={handleUpdate} onFilterChange={setExportFilter} />
        )}
      </section>
    </div>
  )
}

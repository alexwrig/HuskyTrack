'use client'

import { useState, useEffect, useCallback } from 'react'
import { UploadZone } from '@/src/components/UploadZone'
import { ReceiptTable } from '@/src/components/ReceiptTable'
import type { Receipt } from '@/src/types'

interface UploadResult {
  name: string
  receipt?: Receipt
  count?: number  // for spreadsheet imports: rows added
  error?: string
}

interface ProcessingState {
  active: boolean
  fileCount: number
  added: number
  errors: string[]
}

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<ProcessingState>({
    active: false, fileCount: 0, added: 0, errors: [],
  })
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await fetch('/api/receipts')
      if (!res.ok) throw new Error(await res.text())
      setReceipts(await res.json() as Receipt[])
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const handleUpload = async (files: File[]) => {
    setGlobalError(null)
    setProcessing({ active: true, fileCount: files.length, added: 0, errors: [] })

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json() as { succeeded: UploadResult[]; failed: UploadResult[]; error?: string }

      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      const added = data.succeeded.reduce((s, r) => s + (r.count ?? (r.receipt ? 1 : 0)), 0)
      const errors = data.failed.map((f) => `${f.name}: ${f.error}`)
      setProcessing((p) => ({ ...p, active: false, added, errors }))
      await fetchReceipts()
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Upload failed')
      setProcessing((p) => ({ ...p, active: false }))
    }
  }

  const handleDelete = async (id: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id))
    try {
      await fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    } catch {
      await fetchReceipts()
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Delete all receipts? This cannot be undone.')) return
    try {
      await fetch('/api/receipts', { method: 'DELETE' })
      setReceipts([])
      setProcessing({ active: false, fileCount: 0, added: 0, errors: [] })
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to clear')
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Upload section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">Upload Receipts</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Drop a folder of receipts or a spreadsheet and everything gets itemized automatically.
            </p>
          </div>
          {receipts.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => window.open('/api/export', '_blank')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] transition-colors shadow-sm"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 10.03a.75.75 0 111.06-1.06L9.25 11.44V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                  <path d="M3.5 16.25a.75.75 0 000 1.5h13a.75.75 0 000-1.5h-13z" />
                </svg>
                Export XLSX
              </button>
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <UploadZone onUpload={handleUpload} disabled={processing.active} />

        {/* Processing status */}
        {processing.active && (
          <div className="rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin text-[#4B2E83] dark:text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-sm text-[#4B2E83] dark:text-purple-300 font-medium">
                Processing {processing.fileCount} {processing.fileCount === 1 ? 'file' : 'files'}...
              </p>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-purple-200 dark:bg-purple-900 overflow-hidden">
              <div className="h-full bg-[#4B2E83] dark:bg-purple-500 rounded-full animate-pulse w-3/5" />
            </div>
          </div>
        )}

        {/* Post-upload summary */}
        {!processing.active && processing.fileCount > 0 && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            processing.errors.length === 0
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
          }`}>
            <p className="font-medium">
              {processing.added} {processing.added === 1 ? 'receipt' : 'receipts'} added from {processing.fileCount} {processing.fileCount === 1 ? 'file' : 'files'}.
            </p>
            {processing.errors.map((e, i) => (
              <p key={i} className="mt-1 text-xs opacity-75">{e}</p>
            ))}
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {globalError}
          </div>
        )}
      </section>

      {/* Receipts section */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
          Receipts
          {receipts.length > 0 && (
            <span className="ml-2 text-base font-normal text-stone-400 dark:text-stone-600">({receipts.length})</span>
          )}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-stone-400 dark:text-stone-600 gap-2">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading...
          </div>
        ) : (
          <ReceiptTable receipts={receipts} onDelete={handleDelete} />
        )}
      </section>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { UploadZone } from '@/src/components/UploadZone'
import { ReceiptTable } from '@/src/components/ReceiptTable'
import type { Receipt } from '@/src/types'

interface UploadResult {
  name: string
  receipt?: Receipt
  count?: number
  error?: string
}

interface ProcessingState {
  active: boolean
  phase: 'processing' | 'waiting' | 'done'
  currentFile: number
  totalFiles: number
  currentFileName: string
  waitSecondsLeft: number
  added: number
  errors: string[]
}

const SPREADSHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
])

// 13 seconds between Claude calls = ~4.6/min, safely under the 5/min limit
const RATE_LIMIT_MS = 13000

async function sendFile(file: File): Promise<{ added: number; error?: string }> {
  const formData = new FormData()
  formData.append('files', file)
  try {
    const res = await fetch('/api/parse', { method: 'POST', body: formData })
    const data = await res.json() as { succeeded: UploadResult[]; failed: UploadResult[]; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Upload failed')
    const added = data.succeeded.reduce((s, r) => s + (r.count ?? (r.receipt ? 1 : 0)), 0)
    const failed = data.failed[0]
    return { added, error: failed ? `${failed.name}: ${failed.error}` : undefined }
  } catch (err) {
    return { added: 0, error: err instanceof Error ? err.message : 'Failed' }
  }
}

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<ProcessingState>({
    active: false, phase: 'done', currentFile: 0, totalFiles: 0,
    currentFileName: '', waitSecondsLeft: 0, added: 0, errors: [],
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

    const sheets   = files.filter((f) => SPREADSHEET_TYPES.has(f.type))
    const receipts = files.filter((f) => !SPREADSHEET_TYPES.has(f.type))
    const total    = files.length
    let added = 0
    const errors: string[] = []

    // Process spreadsheets first, all at once (no Claude, no rate limit)
    for (let i = 0; i < sheets.length; i++) {
      setProcessing({
        active: true, phase: 'processing',
        currentFile: i + 1, totalFiles: total,
        currentFileName: sheets[i].name,
        waitSecondsLeft: 0, added, errors,
      })
      const result = await sendFile(sheets[i])
      added += result.added
      if (result.error) errors.push(result.error)
    }

    // Process receipt files one at a time with rate-limit spacing
    for (let i = 0; i < receipts.length; i++) {
      const fileNumber = sheets.length + i + 1

      // Cooldown before every Claude call except the very first one overall
      if (i > 0 || sheets.length > 0) {
        const totalSeconds = Math.ceil(RATE_LIMIT_MS / 1000)
        for (let s = totalSeconds; s > 0; s--) {
          setProcessing({
            active: true, phase: 'waiting',
            currentFile: fileNumber - 1, totalFiles: total,
            currentFileName: receipts[i].name,
            waitSecondsLeft: s, added, errors,
          })
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      setProcessing({
        active: true, phase: 'processing',
        currentFile: fileNumber, totalFiles: total,
        currentFileName: receipts[i].name,
        waitSecondsLeft: 0, added, errors,
      })

      const result = await sendFile(receipts[i])
      added += result.added
      if (result.error) errors.push(result.error)
    }

    setProcessing({
      active: false, phase: 'done',
      currentFile: total, totalFiles: total,
      currentFileName: '', waitSecondsLeft: 0,
      added, errors,
    })
    await fetchReceipts()
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
      setProcessing((p) => ({ ...p, active: false, added: 0, errors: [] }))
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to clear')
    }
  }

  const pct = processing.totalFiles > 0
    ? Math.round(((processing.currentFile - (processing.phase === 'processing' ? 1 : 0)) / processing.totalFiles) * 100)
    : 0

  return (
    <div className="flex flex-col gap-12">
      {/* Upload section */}
      <section className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
              Upload Receipts
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
              Drop a folder of receipts or a spreadsheet and everything gets itemized automatically.
            </p>
          </div>
          {receipts.length > 0 && (
            <div className="flex items-center gap-3 shrink-0 pb-0.5">
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

        {/* Live processing panel */}
        {processing.active && (
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-col gap-3">
              {processing.phase === 'waiting' ? (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      Rate limit cooldown
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      Next: {processing.currentFileName} in {processing.waitSecondsLeft}s
                    </p>
                  </div>
                  <span className="text-2xl font-display font-bold text-amber-500 dark:text-amber-400 tabular-nums shrink-0">
                    {processing.waitSecondsLeft}s
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 animate-spin text-[#4B2E83] dark:text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                      File {processing.currentFile} of {processing.totalFiles}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      {processing.currentFileName}
                    </p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                {processing.phase === 'waiting' ? (
                  <div
                    className="h-full bg-amber-400 dark:bg-amber-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(processing.waitSecondsLeft / Math.ceil(RATE_LIMIT_MS / 1000)) * 100}%` }}
                  />
                ) : (
                  <div
                    className="h-full bg-[#4B2E83] dark:bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>

              {/* Running tally */}
              {(processing.added > 0 || processing.errors.length > 0) && (
                <div className="flex gap-4 text-xs pt-1 border-t border-stone-100 dark:border-stone-800">
                  {processing.added > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {processing.added} {processing.added === 1 ? 'receipt' : 'receipts'} added
                    </span>
                  )}
                  {processing.errors.length > 0 && (
                    <span className="text-red-500 dark:text-red-400">
                      {processing.errors.length} failed
                    </span>
                  )}
                </div>
              )}
            </div>
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

      {/* Receipts section */}
      <section className="flex flex-col gap-5">
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
          <ReceiptTable receipts={receipts} onDelete={handleDelete} />
        )}
      </section>
    </div>
  )
}

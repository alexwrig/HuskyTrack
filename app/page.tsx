'use client'

import { useState, useEffect, useCallback } from 'react'
import { UploadZone } from '@/src/components/UploadZone'
import { ReceiptTable } from '@/src/components/ReceiptTable'
import type { Receipt } from '@/src/types'

interface UploadResult {
  name: string
  receipt?: Receipt
  error?: string
}

interface ProcessingState {
  active: boolean
  total: number
  done: number
  errors: string[]
}

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<ProcessingState>({
    active: false, total: 0, done: 0, errors: [],
  })
  const [globalError, setGlobalError] = useState<string | null>(null)

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await fetch('/api/receipts')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as Receipt[]
      setReceipts(data)
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const handleUpload = async (files: File[]) => {
    setGlobalError(null)
    setProcessing({ active: true, total: files.length, done: 0, errors: [] })

    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData })
      const data = await res.json() as { succeeded: UploadResult[]; failed: UploadResult[]; error?: string }

      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      const errors = data.failed.map((f) => `${f.name}: ${f.error}`)
      setProcessing((p) => ({ ...p, active: false, done: data.succeeded.length, errors }))
      await fetchReceipts()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setGlobalError(message)
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
      setProcessing({ active: false, total: 0, done: 0, errors: [] })
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to clear')
    }
  }

  const handleExport = () => {
    window.open('/api/export', '_blank')
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Upload section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Upload Receipts</h2>
            <p className="text-sm text-gray-500">Drop your PDFs or images, Claude will parse them automatically.</p>
          </div>
          <div className="flex items-center gap-3">
            {receipts.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] transition-colors shadow-sm"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 10.03a.75.75 0 111.06-1.06L9.25 11.44V3.75A.75.75 0 0110 3zM3.5 14.75a.75.75 0 011.5 0v1.5a.75.75 0 01-1.5 0v-1.5zm12 0a.75.75 0 011.5 0v1.5a.75.75 0 01-1.5 0v-1.5zM3.5 14.75h13" clipRule="evenodd" />
                    <path d="M3.5 16.25h13v.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-.5z" />
                  </svg>
                  Export XLSX
                </button>
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        </div>

        <UploadZone onUpload={handleUpload} disabled={processing.active} />

        {/* Processing status */}
        {processing.active && (
          <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin text-[#4B2E83]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-sm text-[#4B2E83] font-medium">
                Parsing {processing.total} {processing.total === 1 ? 'file' : 'files'} with Claude…
              </p>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-purple-200 overflow-hidden">
              <div className="h-full bg-[#4B2E83] rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {/* Post-upload summary */}
        {!processing.active && processing.total > 0 && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            processing.errors.length === 0
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}>
            <p className="font-medium">
              {processing.done} of {processing.total} {processing.total === 1 ? 'file' : 'files'} parsed successfully.
            </p>
            {processing.errors.map((e, i) => (
              <p key={i} className="mt-1 text-xs opacity-80">{e}</p>
            ))}
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {globalError}
          </div>
        )}
      </section>

      {/* Receipts section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Receipts
            {receipts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({receipts.length})</span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading…
          </div>
        ) : (
          <ReceiptTable receipts={receipts} onDelete={handleDelete} />
        )}
      </section>
    </div>
  )
}

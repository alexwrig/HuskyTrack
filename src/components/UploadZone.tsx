'use client'

import { useRef, useState, useCallback } from 'react'
import clsx from 'clsx'

interface Props {
  onUpload: (files: File[]) => void
  disabled?: boolean
}

const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const SHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
])
const ALL_ACCEPTED = new Set([...RECEIPT_TYPES, ...SHEET_TYPES])
const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv'

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      )
    })
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const all: FileSystemEntry[] = []
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    let batch = await readBatch()
    while (batch.length > 0) {
      all.push(...batch)
      batch = await readBatch()
    }
    const nested = await Promise.all(all.map(readEntry))
    return nested.flat()
  }
  return []
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items)
  // Use directory-aware entry API when available
  if (items[0] && typeof items[0].webkitGetAsEntry === 'function') {
    const entries = items.map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[]
    const nested = await Promise.all(entries.map(readEntry))
    return nested.flat()
  }
  return Array.from(dt.files)
}

export function UploadZone({ onUpload, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled) return
      const valid = files.filter((f) => ALL_ACCEPTED.has(f.type))
      if (valid.length) onUpload(valid)
    },
    [onUpload, disabled],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = await filesFromDrop(e.dataTransfer)
    handleFiles(files)
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        'relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 select-none',
        dragging
          ? 'border-[#4B2E83] bg-purple-50 dark:bg-purple-950/20 scale-[1.01]'
          : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-[#4B2E83] hover:bg-stone-50 dark:hover:bg-stone-800/60',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Icon */}
      <div className={clsx(
        'rounded-2xl p-4 transition-colors',
        dragging ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-stone-100 dark:bg-stone-800',
      )}>
        <svg className={clsx('h-10 w-10', dragging ? 'text-[#4B2E83]' : 'text-stone-400 dark:text-stone-500')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 3 3 0 0 1 3.445 3.907 3.75 3.75 0 0 1-3.133 4.188" />
        </svg>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-stone-800 dark:text-stone-100">
          {dragging ? 'Release to upload' : 'Drop files or a folder here'}
        </p>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Receipts (PDF, images) or spreadsheets (XLSX, CSV), Claude will parse them automatically.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] transition-colors shadow-sm"
        >
          Browse files
        </button>
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          className="rounded-lg border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          Select folder
        </button>
      </div>

      {/* Format hint */}
      <p className="text-xs text-stone-400 dark:text-stone-600 tracking-wide uppercase">
        PDF · JPEG · PNG · XLSX · CSV
      </p>

      <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
      {/* webkitdirectory is not in React's types but is a valid HTML attribute */}
      <input ref={folderRef} type="file" multiple className="hidden"
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
    </div>
  )
}

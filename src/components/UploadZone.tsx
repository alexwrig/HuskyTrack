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
  'text/comma-separated-values',
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
    handleFiles(await filesFromDrop(e.dataTransfer))
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        'relative overflow-hidden rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-all duration-300 select-none',
        dragging
          ? 'border-[#4B2E83] bg-purple-50 dark:bg-purple-950/20 scale-[1.005]'
          : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-[#B7A57A] hover:bg-stone-50/80 dark:hover:bg-stone-800/60',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Corner accents */}
      <span className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-[#B7A57A]/40 rounded-tl" />
      <span className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-[#B7A57A]/40 rounded-tr" />
      <span className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-[#B7A57A]/40 rounded-bl" />
      <span className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-[#B7A57A]/40 rounded-br" />

      <div className="flex flex-col items-center gap-5">
        {/* Icon */}
        <div className={clsx(
          'rounded-full p-4 ring-1 transition-colors',
          dragging
            ? 'bg-purple-100 dark:bg-purple-900/40 ring-purple-200 dark:ring-purple-800'
            : 'bg-stone-100 dark:bg-stone-800 ring-stone-200 dark:ring-stone-700',
        )}>
          <svg
            className={clsx('h-9 w-9 transition-colors', dragging ? 'text-[#4B2E83]' : 'text-stone-400 dark:text-stone-500')}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 3 3 0 0 1 3.445 3.907 3.75 3.75 0 0 1-3.133 4.188" />
          </svg>
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-2">
          <p className="font-display text-2xl font-bold text-stone-800 dark:text-stone-100">
            {dragging ? 'Release to upload' : 'Drop your files here'}
          </p>

          {/* Gold rule */}
          <span className="block w-12 h-px bg-[#B7A57A]/50" />

          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm leading-relaxed">
            Receipts, images, and spreadsheets welcome. Claude will parse them automatically.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-[#4B2E83] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3d2569] transition-colors shadow-sm"
          >
            Browse files
          </button>
          <button
            type="button"
            onClick={() => folderRef.current?.click()}
            className="rounded-lg border border-stone-300 dark:border-stone-600 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            Select folder
          </button>
        </div>

        {/* Format pills */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {['PDF', 'JPEG', 'PNG', 'XLSX', 'CSV'].map((fmt) => (
            <span key={fmt} className="px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-500 dark:text-stone-500 tracking-wide">
              {fmt}
            </span>
          ))}
        </div>
      </div>

      <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
      <input ref={folderRef} type="file" multiple className="hidden"
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
    </div>
  )
}

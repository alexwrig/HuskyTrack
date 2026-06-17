'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}

const PRESETS = [
  { label: 'Chase statement', text: 'This is a Chase credit card statement. Import all purchases as expenses. Amounts shown as negative are purchases.' },
  { label: 'Bank of America', text: 'This is a Bank of America statement. Debit column entries are expenses, credit column entries are payments to skip.' },
  { label: 'Only education', text: 'Only include transactions that are clearly education-related expenses.' },
  { label: 'Specific month', text: 'Only include transactions from this academic year.' },
]

export function InstructionsModal({ value, onChange, onClose }: Props) {
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleSave = () => {
    onChange(draft)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 w-full max-w-lg flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">Parsing instructions</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Tell Claude what to look for, what to skip, or how to interpret the file.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors mt-0.5"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Presets */}
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDraft(p.text)}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-[#4B2E83]/10 hover:text-[#4B2E83] dark:hover:text-purple-400 transition-colors border border-transparent hover:border-[#4B2E83]/20"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <div className="px-6 pt-3 pb-5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. This is a Chase Sapphire credit card statement from March 2024. Only parse grocery and bookstore transactions."
            rows={4}
            className="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 px-3 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors resize-none"
          />
          {draft && (
            <button
              onClick={() => setDraft('')}
              className="mt-1.5 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-950/50 border-t border-stone-100 dark:border-stone-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-[#4B2E83] text-sm font-medium text-white hover:bg-[#3d2569] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

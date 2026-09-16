'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt])
  }

  const buttonLabel = selected.length === 0
    ? `All ${label.toLowerCase()}`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label.toLowerCase()} selected`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 shadow-sm hover:border-[#4B2E83] dark:hover:border-purple-400 active:scale-[0.98] transition-all"
      >
        {buttonLabel}
        <svg className="h-3.5 w-3.5 text-stone-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-lg p-2 flex flex-col gap-0.5 origin-top animate-scale-in">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-left text-xs text-[#4B2E83] dark:text-purple-400 hover:underline px-2 py-1"
            >
              Clear all
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer text-sm text-stone-700 dark:text-stone-300"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-[#4B2E83]"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import type { ReceiptFilter } from './ReceiptTable'

interface Props {
  filter: ReceiptFilter
  onConfirm: () => void
  onCancel: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-stone-500 dark:text-stone-400">{label}</span>
      <span className="text-stone-900 dark:text-stone-100 font-medium text-right">{value}</span>
    </div>
  )
}

export function ExportConfirmModal({ filter, onConfirm, onCancel }: Props) {
  const hasFilter = filter.categories.length > 0 || filter.cities.length > 0 || Boolean(filter.startDate) || Boolean(filter.endDate)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      <div className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 w-full max-w-sm flex flex-col gap-0 overflow-hidden animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800">
          <h2 className="font-display text-lg font-bold text-stone-900 dark:text-stone-100">Export spreadsheet</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Confirm what to include in the download.</p>
        </div>

        <div className="px-6 py-4 flex flex-col gap-2 text-sm">
          <Row label="Categories" value={filter.categories.length > 0 ? filter.categories.join(', ') : 'All categories'} />
          <Row label="Cities" value={filter.cities.length > 0 ? filter.cities.join(', ') : 'All cities'} />
          <Row
            label="Date range"
            value={filter.startDate || filter.endDate ? `${filter.startDate || 'earliest'} to ${filter.endDate || 'latest'}` : 'All dates'}
          />
          {!hasFilter && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">No filters applied -- exporting everything.</p>
          )}
        </div>

        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-950/50 border-t border-stone-100 dark:border-stone-800 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-[#4B2E83] text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] transition-all"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
}

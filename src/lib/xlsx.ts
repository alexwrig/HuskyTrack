import * as XLSX from 'xlsx'
import type { Receipt, ActivityLogEntry } from '../types'

export function generateXlsx(receipts: Receipt[]): Uint8Array {
  const data = receipts.map((r) => ({
    Date:           r.date,
    Merchant:       r.merchant,
    Amount:         r.amount,
    Category:       r.category,
    Purpose:        r.purpose_sub ?? r.purpose ?? '',
    City:           r.city ?? '',
    State:          r.state ?? '',
    'Card (last 4)': r.card_last_four ?? '',
    'Qualified?':   r.is_qualified ? 'Yes' : 'No',
    'Created At':   r.created_at,
  }))

  const ws = XLSX.utils.json_to_sheet(data)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 28 }, // Merchant
    { wch: 10 }, // Amount
    { wch: 24 }, // Category
    { wch: 22 }, // Purpose
    { wch: 18 }, // City
    { wch: 8 },  // State
    { wch: 12 }, // Card
    { wch: 10 }, // Qualified
    { wch: 22 }, // Created At
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

export function generateActivityLogXlsx(entries: ActivityLogEntry[]): Uint8Array {
  const data = entries.map((e) => ({
    'Added At':    e.created_at,
    Source:        e.source,
    Merchant:      e.merchant,
    Amount:        e.amount,
    'Expense Date': e.date,
    Category:      e.category,
    City:          e.city ?? '',
    State:         e.state ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)

  ws['!cols'] = [
    { wch: 22 }, // Added At
    { wch: 18 }, // Source
    { wch: 28 }, // Merchant
    { wch: 10 }, // Amount
    { wch: 14 }, // Expense Date
    { wch: 24 }, // Category
    { wch: 18 }, // City
    { wch: 8 },  // State
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Activity Log')

  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

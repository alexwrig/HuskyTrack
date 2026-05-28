import * as XLSX from 'xlsx'
import type { Receipt } from '../types'

export function generateXlsx(receipts: Receipt[]): Uint8Array {
  const data = receipts.map((r) => ({
    Date:           r.date,
    Merchant:       r.merchant,
    Amount:         r.amount,
    Category:       r.category,
    Purpose:        r.purpose_sub ?? r.purpose ?? '',
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
    { wch: 12 }, // Card
    { wch: 10 }, // Qualified
    { wch: 22 }, // Created At
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

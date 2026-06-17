import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import sharp from 'sharp'
import { parseReceiptFile, parseSpreadsheetRows } from '@/src/lib/anthropic'
import { createReceipt, ensureTable } from '@/src/lib/db'
import { EXPENSE_CATEGORIES } from '@/src/types'
import type { ReceiptCreate, ExpenseCategory } from '@/src/types'

export const runtime = 'nodejs'
export const maxDuration = 120

// ── File type sets ────────────────────────────────────────────────────────────

const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const SHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
])

// ── Spreadsheet parsing ───────────────────────────────────────────────────────

function normalizeKey(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

const SKIP_MERCHANTS = /^(total|balance|payment|thank you|minimum due|credit|autopay|opening|closing|previous)/i

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10)
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  // Try MM/DD/YYYY
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    const d2 = new Date(`${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`)
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function mapRowToReceipt(row: Record<string, unknown>): ReceiptCreate | null {
  const norm: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    norm[normalizeKey(k)] = String(v ?? '').trim()
  }

  const get = (...keys: string[]) => {
    for (const key of keys) if (norm[key]) return norm[key]
    return ''
  }

  const merchant = get(
    'merchant', 'vendor', 'store', 'payee', 'name',
    'description', 'transaction_description', 'details', 'memo',
    'narrative', 'particulars', 'reference',
  )
  if (!merchant || SKIP_MERCHANTS.test(merchant)) return null

  // Handle separate debit/credit columns (common in bank statements)
  let amount: number
  const debit  = get('debit', 'withdrawal', 'charge', 'debit_amount', 'withdrawals')
  const credit = get('credit', 'deposit', 'payment', 'credit_amount', 'deposits')
  if (debit || credit) {
    const debitVal  = debit  ? parseFloat(debit.replace(/[^0-9.]/g, ''))  : 0
    const creditVal = credit ? parseFloat(credit.replace(/[^0-9.]/g, '')) : 0
    // Only import debits (expenses), skip credit-only rows
    if (!debit || isNaN(debitVal) || debitVal === 0) return null
    amount = debitVal
  } else {
    const rawAmount = get('amount', 'total', 'price', 'cost', 'sum', 'transaction_amount')
    if (!rawAmount) return null
    const parsed = parseFloat(rawAmount.replace(/[^0-9.-]/g, ''))
    if (isNaN(parsed) || parsed === 0) return null
    amount = Math.abs(parsed) // negative amounts in statements = purchases
  }

  const rawDate = get(
    'date', 'transaction_date', 'purchase_date', 'posted_date',
    'post_date', 'settlement_date', 'trans_date', 'booking_date',
  )
  const date = parseDate(rawDate)

  const rawCategory = get('category', 'expense_category', 'type', 'transaction_type')
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as ExpenseCategory)
    : 'Other'

  const rawCard = get('card_last_four', 'card__last_4_', 'card_no', 'card', 'last_4', 'last4', 'account_number')
  const card_last_four = rawCard.replace(/[^0-9]/g, '').slice(-4) || null

  return {
    date,
    merchant,
    amount,
    category,
    purpose_sub: get('purpose', 'purpose_sub', 'subcategory') || null,
    purpose:     get('notes', 'memo', 'note') || null,
    card_last_four,
  }
}

async function processSpreadsheet(
  file: File,
  customInstructions?: string,
): Promise<{ name: string; count?: number; error?: string }> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })

    // Use Claude when instructions are provided
    if (customInstructions?.trim()) {
      const parsed = await parseSpreadsheetRows(rows, customInstructions)
      let count = 0
      for (const item of parsed) {
        await createReceipt({
          date:           item.date,
          merchant:       item.merchant,
          amount:         Math.abs(item.amount),
          category:       (EXPENSE_CATEGORIES as readonly string[]).includes(item.category)
                            ? item.category as ExpenseCategory
                            : 'Other',
          purpose_sub:    null,
          purpose:        null,
          card_last_four: item.card_last_four,
        })
        count++
      }
      return { name: file.name, count }
    }

    // Fallback: column mapping
    let count = 0
    for (const row of rows) {
      const data = mapRowToReceipt(row)
      if (data) {
        await createReceipt(data)
        count++
      }
    }

    return { name: file.name, count }
  } catch (err) {
    return { name: file.name, error: err instanceof Error ? err.message : 'Spreadsheet parse error' }
  }
}

// ── Receipt parsing (Claude) ──────────────────────────────────────────────────

async function processReceiptFile(file: File, customInstructions?: string): Promise<{ name: string; receipt?: object; error?: string }> {
  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer())
    let mimeType = file.type || 'application/pdf'
    let base64: string

    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      const converted = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer()
      base64 = converted.toString('base64')
      mimeType = 'image/jpeg'
    } else {
      base64 = rawBuffer.toString('base64')
    }
    const parsed = await parseReceiptFile(base64, mimeType, customInstructions)

    const data: ReceiptCreate = {
      date:           parsed.date ?? new Date().toISOString().slice(0, 10),
      merchant:       parsed.merchant ?? 'Unknown',
      amount:         parsed.amount ?? 0,
      category:       parsed.suggested_category ?? 'Other',
      purpose_sub:    parsed.suggested_purpose ?? null,
      purpose:        parsed.suggested_description ?? null,
      card_last_four: parsed.card_last_four ?? null,
    }

    const receipt = await createReceipt(data)
    return { name: file.name, receipt }
  } catch (err) {
    return { name: file.name, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function batchProcess<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const settled = await Promise.allSettled(items.slice(i, i + limit).map(fn))
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value)
    }
  }
  return results
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await ensureTable()

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const customInstructions = (formData.get('instructions') as string | null) ?? undefined

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const unsupported = files.find((f) => !RECEIPT_TYPES.has(f.type) && !SHEET_TYPES.has(f.type))
    if (unsupported) {
      return NextResponse.json(
        { error: `Unsupported file type: ${unsupported.name} (${unsupported.type})` },
        { status: 400 },
      )
    }

    const receipts = files.filter((f) => RECEIPT_TYPES.has(f.type))
    const sheets   = files.filter((f) => SHEET_TYPES.has(f.type))

    const [receiptResults, sheetResults] = await Promise.all([
      batchProcess(receipts, 3, (f) => processReceiptFile(f, customInstructions)),
      batchProcess(sheets,   1, (f) => processSpreadsheet(f, customInstructions)),
    ])

    const all = [...receiptResults, ...sheetResults] as Array<{ name: string; receipt?: object; count?: number; error?: string }>
    const succeeded = all.filter((r) => !r.error)
    const failed    = all.filter((r) =>  r.error)

    return NextResponse.json({ succeeded, failed })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

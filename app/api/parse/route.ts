import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import sharp from 'sharp'
import { parseReceiptFile } from '@/src/lib/anthropic'
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

function mapRowToReceipt(row: Record<string, unknown>): ReceiptCreate | null {
  const norm: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    norm[normalizeKey(k)] = String(v ?? '').trim()
  }

  const get = (...keys: string[]) => {
    for (const key of keys) if (norm[key]) return norm[key]
    return ''
  }

  const merchant = get('merchant', 'vendor', 'store', 'payee', 'name', 'description')
  if (!merchant) return null

  const rawAmount = get('amount', 'total', 'price', 'cost', 'sum')
  const amount = parseFloat(rawAmount.replace(/[^0-9.-]/g, ''))
  if (!rawAmount || isNaN(amount)) return null

  const rawDate = get('date', 'transaction_date', 'purchase_date')
  let date = new Date().toISOString().slice(0, 10)
  if (rawDate) {
    const parsed = new Date(rawDate)
    if (!isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10)
  }

  const rawCategory = get('category', 'expense_category', 'type')
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as ExpenseCategory)
    : 'Other'

  const rawCard = get('card_last_four', 'card__last_4_', 'card', 'last_4', 'last4')
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

async function processSpreadsheet(file: File): Promise<{ name: string; count?: number; error?: string }> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })

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

async function processReceiptFile(file: File): Promise<{ name: string; receipt?: object; error?: string }> {
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
    const parsed = await parseReceiptFile(base64, mimeType)

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
      batchProcess(receipts, 3, processReceiptFile),
      batchProcess(sheets,   1, processSpreadsheet),
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

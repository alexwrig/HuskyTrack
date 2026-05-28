import { neon } from '@neondatabase/serverless'
import type { Receipt, ReceiptCreate, ReceiptUpdate } from '../types'
import { QUALIFIED_CATEGORIES } from '../types'

function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('Set DATABASE_URL or POSTGRES_URL in .env.local (see .env.local.example)')
  return neon(url)
}

export async function ensureTable(): Promise<void> {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      merchant    TEXT NOT NULL,
      amount      FLOAT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'Other',
      purpose_sub TEXT,
      purpose     TEXT,
      card_last_four TEXT,
      is_qualified   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts (date DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_receipts_category ON receipts (category)`
}

function rowToReceipt(row: Record<string, unknown>): Receipt {
  return {
    id:             row.id as string,
    date:           row.date as string,
    merchant:       row.merchant as string,
    amount:         Number(row.amount),
    category:       row.category as Receipt['category'],
    purpose_sub:    (row.purpose_sub as string | null) ?? null,
    purpose:        (row.purpose as string | null) ?? null,
    card_last_four: (row.card_last_four as string | null) ?? null,
    is_qualified:   Boolean(row.is_qualified),
    created_at:     row.created_at instanceof Date
      ? row.created_at.toISOString()
      : (row.created_at as string),
  }
}

export async function createReceipt(data: ReceiptCreate): Promise<Receipt> {
  const sql = getDb()
  const id = crypto.randomUUID()
  const is_qualified = QUALIFIED_CATEGORIES.includes(data.category)
  const rows = await sql`
    INSERT INTO receipts (id, date, merchant, amount, category, purpose_sub, purpose, card_last_four, is_qualified)
    VALUES (
      ${id}, ${data.date}, ${data.merchant}, ${data.amount},
      ${data.category}, ${data.purpose_sub ?? null}, ${data.purpose ?? null},
      ${data.card_last_four ?? null}, ${is_qualified}
    )
    RETURNING *
  `
  return rowToReceipt(rows[0] as Record<string, unknown>)
}

export async function listReceipts(filters?: {
  category?: string
  start_date?: string
  end_date?: string
}): Promise<Receipt[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM receipts ORDER BY date DESC, created_at DESC`
  let receipts = rows.map((r) => rowToReceipt(r as Record<string, unknown>))

  if (filters?.category) receipts = receipts.filter((r) => r.category === filters.category)
  if (filters?.start_date) receipts = receipts.filter((r) => r.date >= filters.start_date!)
  if (filters?.end_date) receipts = receipts.filter((r) => r.date <= filters.end_date!)

  return receipts
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM receipts WHERE id = ${id}`
  return rows[0] ? rowToReceipt(rows[0] as Record<string, unknown>) : null
}

export async function updateReceipt(id: string, data: ReceiptUpdate): Promise<Receipt | null> {
  const existing = await getReceipt(id)
  if (!existing) return null

  const merged = { ...existing, ...data }
  const is_qualified = QUALIFIED_CATEGORIES.includes(merged.category)
  const sql = getDb()

  const rows = await sql`
    UPDATE receipts SET
      date           = ${merged.date},
      merchant       = ${merged.merchant},
      amount         = ${merged.amount},
      category       = ${merged.category},
      purpose_sub    = ${merged.purpose_sub ?? null},
      purpose        = ${merged.purpose ?? null},
      card_last_four = ${merged.card_last_four ?? null},
      is_qualified   = ${is_qualified}
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? rowToReceipt(rows[0] as Record<string, unknown>) : null
}

export async function deleteReceipt(id: string): Promise<void> {
  const sql = getDb()
  await sql`DELETE FROM receipts WHERE id = ${id}`
}

export async function clearAllReceipts(): Promise<void> {
  const sql = getDb()
  await sql`DELETE FROM receipts`
}

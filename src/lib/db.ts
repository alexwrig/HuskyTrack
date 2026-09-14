import { neon } from '@neondatabase/serverless'
import type { Receipt, ReceiptCreate, ReceiptUpdate, ReviewItem, ReviewStatus, ParsedReceiptFields } from '../types'
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
  // CREATE TABLE IF NOT EXISTS above is a no-op once the table already exists,
  // so new columns must be added explicitly for existing databases.
  await sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS city  TEXT`
  await sql`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS state TEXT`
  await sql`CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts (date DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_receipts_category ON receipts (category)`
  await sql`CREATE INDEX IF NOT EXISTS idx_receipts_city ON receipts (city)`

  await sql`
    CREATE TABLE IF NOT EXISTS review_queue (
      id           TEXT PRIMARY KEY,
      source       TEXT NOT NULL DEFAULT 'email',
      from_address TEXT,
      subject      TEXT,
      received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      file_name    TEXT,
      mime_type    TEXT,
      file_base64  TEXT,
      email_text   TEXT,
      parsed       JSONB,
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue (status)`

  await sql`
    CREATE TABLE IF NOT EXISTS processed_email_messages (
      message_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

// Claims a webhook message id so retried deliveries of the same email are
// processed only once. Returns true the first time; false on any retry.
export async function claimMessageId(messageId: string): Promise<boolean> {
  const sql = getDb()
  const rows = await sql`
    INSERT INTO processed_email_messages (message_id) VALUES (${messageId})
    ON CONFLICT (message_id) DO NOTHING
    RETURNING message_id
  `
  return rows.length > 0
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
    city:           (row.city as string | null) ?? null,
    state:          (row.state as string | null) ?? null,
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
    INSERT INTO receipts (id, date, merchant, amount, category, purpose_sub, purpose, card_last_four, city, state, is_qualified)
    VALUES (
      ${id}, ${data.date}, ${data.merchant}, ${data.amount},
      ${data.category}, ${data.purpose_sub ?? null}, ${data.purpose ?? null},
      ${data.card_last_four ?? null}, ${data.city ?? null}, ${data.state ?? null}, ${is_qualified}
    )
    RETURNING *
  `
  return rowToReceipt(rows[0] as Record<string, unknown>)
}

export async function listReceipts(filters?: {
  category?: string
  start_date?: string
  end_date?: string
  city?: string
}): Promise<Receipt[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM receipts ORDER BY date DESC, created_at DESC`
  let receipts = rows.map((r) => rowToReceipt(r as Record<string, unknown>))

  if (filters?.category) receipts = receipts.filter((r) => r.category === filters.category)
  if (filters?.start_date) receipts = receipts.filter((r) => r.date >= filters.start_date!)
  if (filters?.end_date) receipts = receipts.filter((r) => r.date <= filters.end_date!)
  if (filters?.city) receipts = receipts.filter((r) => r.city === filters.city)

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
      city           = ${merged.city ?? null},
      state          = ${merged.state ?? null},
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

// ── Review Queue ──────────────────────────────────────────────────────────────

function rowToReviewItem(row: Record<string, unknown>): ReviewItem {
  return {
    id:           row.id as string,
    source:       row.source as ReviewItem['source'],
    from_address: (row.from_address as string | null) ?? null,
    subject:      (row.subject as string | null) ?? null,
    received_at:  row.received_at instanceof Date
      ? row.received_at.toISOString()
      : (row.received_at as string),
    file_name:    (row.file_name as string | null) ?? null,
    mime_type:    (row.mime_type as string | null) ?? null,
    file_base64:  (row.file_base64 as string | null) ?? null,
    email_text:   (row.email_text as string | null) ?? null,
    parsed:       (row.parsed as ParsedReceiptFields | null) ?? null,
    reason:       row.reason as string,
    status:       row.status as ReviewItem['status'],
    created_at:   row.created_at instanceof Date
      ? row.created_at.toISOString()
      : (row.created_at as string),
  }
}

export async function createReviewItem(data: {
  from_address: string | null
  subject: string | null
  file_name: string | null
  mime_type: string | null
  file_base64: string | null
  email_text: string | null
  parsed: ParsedReceiptFields | null
  reason: string
}): Promise<ReviewItem> {
  const sql = getDb()
  const id = crypto.randomUUID()
  const rows = await sql`
    INSERT INTO review_queue (id, source, from_address, subject, file_name, mime_type, file_base64, email_text, parsed, reason, status)
    VALUES (
      ${id}, 'email', ${data.from_address}, ${data.subject}, ${data.file_name}, ${data.mime_type},
      ${data.file_base64}, ${data.email_text}, ${JSON.stringify(data.parsed)}, ${data.reason}, 'pending'
    )
    RETURNING *
  `
  return rowToReviewItem(rows[0] as Record<string, unknown>)
}

export async function listReviewItems(status: ReviewStatus = 'pending'): Promise<ReviewItem[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM review_queue WHERE status = ${status} ORDER BY received_at DESC`
  return rows.map((r) => rowToReviewItem(r as Record<string, unknown>))
}

export async function getReviewItem(id: string): Promise<ReviewItem | null> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM review_queue WHERE id = ${id}`
  return rows[0] ? rowToReviewItem(rows[0] as Record<string, unknown>) : null
}

export async function setReviewItemStatus(id: string, status: ReviewStatus): Promise<void> {
  const sql = getDb()
  await sql`UPDATE review_queue SET status = ${status} WHERE id = ${id}`
}

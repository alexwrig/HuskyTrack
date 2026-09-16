import { neon } from '@neondatabase/serverless'
import type { Receipt, ReceiptCreate, ReceiptUpdate, ReviewItem, ReviewStatus, ParsedReceiptFields, ActivitySource, ActivityLogEntry, DuplicateGroup, PlaidItem, PlaidAccount, PlaidTransaction, UnifiedTransaction, ExpenseCategory } from '../types'
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

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id         TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      source     TEXT NOT NULL,
      merchant   TEXT NOT NULL,
      amount     FLOAT NOT NULL,
      date       TEXT NOT NULL,
      category   TEXT NOT NULL,
      city       TEXT,
      state      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC)`

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id                     TEXT PRIMARY KEY,
      item_id                TEXT NOT NULL UNIQUE,
      access_token_encrypted TEXT NOT NULL,
      institution_name       TEXT,
      cursor                 TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_accounts (
      id         TEXT PRIMARY KEY,
      item_id    TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      mask       TEXT,
      type       TEXT NOT NULL,
      subtype    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_transactions (
      id                    TEXT PRIMARY KEY,
      plaid_transaction_id  TEXT NOT NULL UNIQUE,
      account_id            TEXT NOT NULL,
      date                  TEXT NOT NULL,
      amount                FLOAT NOT NULL,
      merchant              TEXT NOT NULL,
      plaid_category        TEXT,
      category              TEXT NOT NULL DEFAULT 'Other',
      category_confidence   FLOAT,
      city                  TEXT,
      state                 TEXT,
      pending               BOOLEAN NOT NULL DEFAULT FALSE,
      is_qualified          BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions (date DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account ON plaid_transactions (account_id)`
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

export async function createReceipt(data: ReceiptCreate, source: ActivitySource): Promise<Receipt> {
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
  const receipt = rowToReceipt(rows[0] as Record<string, unknown>)

  await sql`
    INSERT INTO activity_log (id, receipt_id, source, merchant, amount, date, category, city, state)
    VALUES (
      ${crypto.randomUUID()}, ${receipt.id}, ${source}, ${receipt.merchant}, ${receipt.amount},
      ${receipt.date}, ${receipt.category}, ${receipt.city}, ${receipt.state}
    )
  `

  return receipt
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

// ── Unified transaction view (receipts + Plaid) ──────────────────────────────
// The frontend edits/deletes by id without knowing which table a row lives
// in, since the main table now shows both sources merged together.

export async function updateTransaction(id: string, data: ReceiptUpdate): Promise<UnifiedTransaction | null> {
  const receipt = await updateReceipt(id, data)
  if (receipt) return { ...receipt, source: 'receipt', pending: false }

  const txn = await updatePlaidTransaction(id, data)
  if (txn) return plaidTransactionToUnified(txn)

  return null
}

export async function deleteTransaction(id: string): Promise<void> {
  await deleteReceipt(id)
  await deletePlaidTransaction(id)
}

export async function listAllTransactions(): Promise<UnifiedTransaction[]> {
  const [receipts, plaidTxns] = await Promise.all([listReceipts(), listPlaidTransactions()])
  const unified = [
    ...receipts.map((r): UnifiedTransaction => ({ ...r, source: 'receipt', pending: false })),
    ...plaidTxns.map(plaidTransactionToUnified),
  ]
  return unified.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
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

// ── Activity Log ──────────────────────────────────────────────────────────────

function rowToActivityLogEntry(row: Record<string, unknown>): ActivityLogEntry {
  return {
    id:         row.id as string,
    receipt_id: row.receipt_id as string,
    source:     row.source as ActivitySource,
    merchant:   row.merchant as string,
    amount:     Number(row.amount),
    date:       row.date as string,
    category:   row.category as ActivityLogEntry['category'],
    city:       (row.city as string | null) ?? null,
    state:      (row.state as string | null) ?? null,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : (row.created_at as string),
  }
}

export async function listActivityLog(): Promise<ActivityLogEntry[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM activity_log ORDER BY created_at DESC`
  return rows.map((r) => rowToActivityLogEntry(r as Record<string, unknown>))
}

// ── Duplicate Detection ───────────────────────────────────────────────────────
// Duplicates are defined as receipts sharing the same date, merchant, and
// amount -- an exact-match rule chosen to keep the false-positive rate low.

export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const sql = getDb()
  const groupKeys = await sql`
    SELECT date, merchant, amount
    FROM receipts
    GROUP BY date, merchant, amount
    HAVING COUNT(*) > 1
  `
  if (groupKeys.length === 0) return []

  const allReceipts = await listReceipts()
  return groupKeys.map((k) => {
    const key = k as { date: string; merchant: string; amount: number }
    const receipts = allReceipts.filter(
      (r) => r.date === key.date && r.merchant === key.merchant && Number(r.amount) === Number(key.amount),
    )
    return { date: key.date, merchant: key.merchant, amount: Number(key.amount), receipts }
  })
}

// Deletes every receipt in each duplicate group except the oldest (by
// created_at), so exactly one survives per group. Returns the deleted ids.
export async function deleteDuplicates(groups: DuplicateGroup[]): Promise<string[]> {
  const idsToDelete: string[] = []
  for (const group of groups) {
    const sorted = [...group.receipts].sort((a, b) => a.created_at.localeCompare(b.created_at))
    idsToDelete.push(...sorted.slice(1).map((r) => r.id))
  }
  const sql = getDb()
  for (const id of idsToDelete) {
    await sql`DELETE FROM receipts WHERE id = ${id}`
  }
  return idsToDelete
}

// ── Plaid ─────────────────────────────────────────────────────────────────────

function rowToPlaidItem(row: Record<string, unknown>): PlaidItem {
  return {
    id:               row.id as string,
    item_id:          row.item_id as string,
    institution_name: (row.institution_name as string | null) ?? null,
    cursor:           (row.cursor as string | null) ?? null,
    created_at:       row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
    updated_at:       row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string),
  }
}

export async function createPlaidItem(data: {
  item_id: string
  access_token_encrypted: string
  institution_name: string | null
}): Promise<PlaidItem> {
  const sql = getDb()
  const id = crypto.randomUUID()
  const rows = await sql`
    INSERT INTO plaid_items (id, item_id, access_token_encrypted, institution_name)
    VALUES (${id}, ${data.item_id}, ${data.access_token_encrypted}, ${data.institution_name})
    RETURNING *
  `
  return rowToPlaidItem(rows[0] as Record<string, unknown>)
}

export async function listPlaidItems(): Promise<PlaidItem[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM plaid_items ORDER BY created_at DESC`
  return rows.map((r) => rowToPlaidItem(r as Record<string, unknown>))
}

export async function getPlaidItem(id: string): Promise<PlaidItem | null> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM plaid_items WHERE id = ${id}`
  return rows[0] ? rowToPlaidItem(rows[0] as Record<string, unknown>) : null
}

// Raw row incl. the encrypted token -- callers that need to call Plaid's API
// decrypt it themselves (see src/lib/plaidSync.ts). Never returned to the client.
export async function getPlaidItemAccessTokenEncrypted(id: string): Promise<string | null> {
  const sql = getDb()
  const rows = await sql`SELECT access_token_encrypted FROM plaid_items WHERE id = ${id}`
  return rows[0] ? (rows[0].access_token_encrypted as string) : null
}

export async function getPlaidItemByPlaidItemId(itemId: string): Promise<PlaidItem | null> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM plaid_items WHERE item_id = ${itemId}`
  return rows[0] ? rowToPlaidItem(rows[0] as Record<string, unknown>) : null
}

export async function updatePlaidItemCursor(id: string, cursor: string): Promise<void> {
  const sql = getDb()
  await sql`UPDATE plaid_items SET cursor = ${cursor}, updated_at = NOW() WHERE id = ${id}`
}

export async function upsertPlaidAccounts(itemId: string, accounts: {
  account_id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
}[]): Promise<void> {
  const sql = getDb()
  for (const a of accounts) {
    await sql`
      INSERT INTO plaid_accounts (id, item_id, account_id, name, mask, type, subtype)
      VALUES (${crypto.randomUUID()}, ${itemId}, ${a.account_id}, ${a.name}, ${a.mask}, ${a.type}, ${a.subtype})
      ON CONFLICT (account_id) DO UPDATE SET
        name = EXCLUDED.name, mask = EXCLUDED.mask, type = EXCLUDED.type, subtype = EXCLUDED.subtype
    `
  }
}

export async function listPlaidAccounts(): Promise<PlaidAccount[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM plaid_accounts ORDER BY created_at DESC`
  return rows.map((r) => ({
    id:         r.id as string,
    item_id:    r.item_id as string,
    account_id: r.account_id as string,
    name:       r.name as string,
    mask:       (r.mask as string | null) ?? null,
    type:       r.type as string,
    subtype:    (r.subtype as string | null) ?? null,
    created_at: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : (r.created_at as string),
  }))
}

function rowToPlaidTransaction(row: Record<string, unknown>): PlaidTransaction {
  return {
    id:                   row.id as string,
    plaid_transaction_id: row.plaid_transaction_id as string,
    account_id:           row.account_id as string,
    date:                 row.date as string,
    amount:               Number(row.amount),
    merchant:             row.merchant as string,
    plaid_category:       (row.plaid_category as string | null) ?? null,
    category:             row.category as ExpenseCategory,
    category_confidence:  row.category_confidence != null ? Number(row.category_confidence) : null,
    city:                 (row.city as string | null) ?? null,
    state:                (row.state as string | null) ?? null,
    pending:              Boolean(row.pending),
    is_qualified:         Boolean(row.is_qualified),
    created_at:           row.created_at instanceof Date ? (row.created_at as Date).toISOString() : (row.created_at as string),
    updated_at:           row.updated_at instanceof Date ? (row.updated_at as Date).toISOString() : (row.updated_at as string),
  }
}

export function plaidTransactionToUnified(t: PlaidTransaction): UnifiedTransaction {
  return {
    id:             t.id,
    date:           t.date,
    merchant:       t.merchant,
    amount:         t.amount,
    category:       t.category,
    purpose_sub:    null,
    purpose:        null,
    card_last_four: null,
    city:           t.city,
    state:          t.state,
    is_qualified:   t.is_qualified,
    created_at:     t.created_at,
    source:         'plaid',
    pending:        t.pending,
  }
}

export async function listPlaidTransactions(): Promise<PlaidTransaction[]> {
  const sql = getDb()
  const rows = await sql`SELECT * FROM plaid_transactions ORDER BY date DESC, created_at DESC`
  return rows.map((r) => rowToPlaidTransaction(r as Record<string, unknown>))
}

export interface PlaidTransactionUpsert {
  plaid_transaction_id: string
  account_id: string
  date: string
  amount: number
  merchant: string
  plaid_category: string | null
  category: ExpenseCategory
  category_confidence: number | null
  city: string | null
  state: string | null
  pending: boolean
}

export async function upsertPlaidTransactions(items: PlaidTransactionUpsert[]): Promise<void> {
  const sql = getDb()
  for (const t of items) {
    const is_qualified = QUALIFIED_CATEGORIES.includes(t.category)
    await sql`
      INSERT INTO plaid_transactions (
        id, plaid_transaction_id, account_id, date, amount, merchant,
        plaid_category, category, category_confidence, city, state, pending, is_qualified
      )
      VALUES (
        ${crypto.randomUUID()}, ${t.plaid_transaction_id}, ${t.account_id}, ${t.date}, ${t.amount}, ${t.merchant},
        ${t.plaid_category}, ${t.category}, ${t.category_confidence}, ${t.city}, ${t.state}, ${t.pending}, ${is_qualified}
      )
      ON CONFLICT (plaid_transaction_id) DO UPDATE SET
        date = EXCLUDED.date, amount = EXCLUDED.amount, merchant = EXCLUDED.merchant,
        plaid_category = EXCLUDED.plaid_category, category = EXCLUDED.category,
        category_confidence = EXCLUDED.category_confidence, city = EXCLUDED.city, state = EXCLUDED.state,
        pending = EXCLUDED.pending, is_qualified = EXCLUDED.is_qualified, updated_at = NOW()
    `
  }
}

export async function deletePlaidTransactionsByPlaidIds(plaidTransactionIds: string[]): Promise<void> {
  if (plaidTransactionIds.length === 0) return
  const sql = getDb()
  for (const id of plaidTransactionIds) {
    await sql`DELETE FROM plaid_transactions WHERE plaid_transaction_id = ${id}`
  }
}

async function updatePlaidTransaction(id: string, data: ReceiptUpdate): Promise<PlaidTransaction | null> {
  const sql = getDb()
  const existingRows = await sql`SELECT * FROM plaid_transactions WHERE id = ${id}`
  if (!existingRows[0]) return null
  const existing = rowToPlaidTransaction(existingRows[0] as Record<string, unknown>)

  const merged = { ...existing, ...data }
  const is_qualified = QUALIFIED_CATEGORIES.includes(merged.category)

  const rows = await sql`
    UPDATE plaid_transactions SET
      date = ${merged.date}, merchant = ${merged.merchant}, amount = ${merged.amount},
      category = ${merged.category}, city = ${merged.city ?? null}, state = ${merged.state ?? null},
      is_qualified = ${is_qualified}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? rowToPlaidTransaction(rows[0] as Record<string, unknown>) : null
}

async function deletePlaidTransaction(id: string): Promise<void> {
  const sql = getDb()
  await sql`DELETE FROM plaid_transactions WHERE id = ${id}`
}

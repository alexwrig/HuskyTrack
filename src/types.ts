// ── IRS 529 Categories ────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Tuition & Fees',
  'Housing & Food',
  'Food & Groceries',
  'Books & Course Supplies',
  'Technology',
  'Special Needs Services',
  'Apprenticeship Programs',
  'Student Loan Repayment',
  'K-12 Tuition',
  'Other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const QUALIFIED_CATEGORIES: ExpenseCategory[] = [
  'Tuition & Fees',
  'Housing & Food',
  'Food & Groceries',
  'Books & Course Supplies',
  'Technology',
  'Special Needs Services',
  'Apprenticeship Programs',
  'Student Loan Repayment',
  'K-12 Tuition',
]

export const HOUSING_FOOD_CATEGORIES: ExpenseCategory[] = [
  'Housing & Food',
  'Food & Groceries',
]

// ── Purpose Sub-categories ────────────────────────────────────────────────────

export const SUB_PURPOSE_MAP: Record<ExpenseCategory, readonly string[]> = {
  'Tuition & Fees':          ['Enrollment Fee', 'Lab Fee', 'Activity Fee', 'Course Fee', 'Other'],
  'Housing & Food':          ['Rent', 'Utilities', 'Dining Hall', 'Other'],
  'Food & Groceries':        ['Groceries', 'Dining', 'Meal Plan', 'Other'],
  'Books & Course Supplies': ['Textbooks', 'Notebooks', 'Lab Supplies', 'Art Supplies', 'Course Materials', 'Other'],
  'Technology':              ['Software', 'Hardware', 'Accessories', 'Subscription', 'Other'],
  'Special Needs Services':  ['Therapy', 'Adaptive Equipment', 'Support Services', 'Other'],
  'Apprenticeship Programs': ['Program Fee', 'Materials', 'Other'],
  'Student Loan Repayment':  ['Principal', 'Interest', 'Other'],
  'K-12 Tuition':            ['Tuition Payment', 'Activity Fee', 'Other'],
  'Other':                   ['Other'],
}

export const ALL_SUB_PURPOSES = [
  'Enrollment Fee', 'Lab Fee', 'Activity Fee', 'Course Fee',
  'Rent', 'Utilities', 'Dining Hall',
  'Groceries', 'Dining', 'Meal Plan',
  'Textbooks', 'Notebooks', 'Lab Supplies', 'Art Supplies', 'Course Materials',
  'Software', 'Hardware', 'Accessories', 'Subscription',
  'Therapy', 'Adaptive Equipment', 'Support Services',
  'Program Fee', 'Materials',
  'Principal', 'Interest',
  'Tuition Payment',
  'Other',
] as const

// ── Core Receipt ──────────────────────────────────────────────────────────────

export interface Receipt {
  id: string
  date: string           // YYYY-MM-DD
  merchant: string
  amount: number
  category: ExpenseCategory
  purpose_sub: string | null
  purpose: string | null
  card_last_four: string | null
  card_name: string | null
  city: string | null
  state: string | null
  is_qualified: boolean
  created_at: string
}

export type ReceiptCreate = Omit<Receipt, 'id' | 'is_qualified' | 'created_at'>
export type ReceiptUpdate = Partial<ReceiptCreate>

// ── Unified transaction view (receipts + Plaid, merged for display) ─────────────
// A strict superset of Receipt (extra fields only), so it satisfies every
// existing Receipt-shaped prop/type without touching ReceiptCreate/Update.

export interface UnifiedTransaction extends Receipt {
  source: 'receipt' | 'plaid'
  pending: boolean
}

// ── Plaid ─────────────────────────────────────────────────────────────────────

export interface PlaidItem {
  id: string
  item_id: string
  institution_name: string | null
  cursor: string | null
  created_at: string
  updated_at: string
}

export interface PlaidAccount {
  id: string
  item_id: string
  account_id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
  created_at: string
}

export interface PlaidTransaction {
  id: string
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
  is_qualified: boolean
  created_at: string
  updated_at: string
}

// ── Claude Parsing ────────────────────────────────────────────────────────────

export interface ParsedReceiptFields {
  date: string | null
  merchant: string | null
  amount: number | null
  suggested_category: ExpenseCategory | null
  suggested_purpose: string | null
  suggested_description: string | null
  card_last_four: string | null
  city: string | null
  state: string | null
  confidence: number | null
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReceiptFilters {
  start_date?: string
  end_date?: string
  category?: ExpenseCategory
  card_last_four?: string
  city?: string
  sort_by?: 'date' | 'amount' | 'merchant'
  sort_order?: 'asc' | 'desc'
}

// ── Review Queue (failed/low-confidence email ingestion) ────────────────────────

export type ReviewStatus = 'pending' | 'resolved' | 'discarded'

export interface ReviewItem {
  id: string
  source: 'email'
  from_address: string | null
  subject: string | null
  received_at: string
  file_name: string | null
  mime_type: string | null
  file_base64: string | null
  email_text: string | null
  parsed: ParsedReceiptFields | null
  reason: string
  status: ReviewStatus
  created_at: string
}

// ── Activity Log ──────────────────────────────────────────────────────────────

export const ACTIVITY_SOURCES = [
  'Manual upload',
  'Spreadsheet import',
  'Email (auto)',
  'Email (reviewed)',
] as const

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number]

export interface ActivityLogEntry {
  id: string
  receipt_id: string
  source: ActivitySource
  merchant: string
  amount: number
  date: string
  category: ExpenseCategory
  city: string | null
  state: string | null
  created_at: string
}

// ── Duplicate Detection ───────────────────────────────────────────────────────

export interface DuplicateGroup {
  date: string
  merchant: string
  amount: number
  receipts: Receipt[]
}

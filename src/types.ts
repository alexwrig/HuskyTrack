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
  is_qualified: boolean
  created_at: string
}

export type ReceiptCreate = Omit<Receipt, 'id' | 'is_qualified' | 'created_at'>
export type ReceiptUpdate = Partial<ReceiptCreate>

// ── Claude Parsing ────────────────────────────────────────────────────────────

export interface ParsedReceiptFields {
  date: string | null
  merchant: string | null
  amount: number | null
  suggested_category: ExpenseCategory | null
  suggested_purpose: string | null
  suggested_description: string | null
  card_last_four: string | null
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReceiptFilters {
  start_date?: string
  end_date?: string
  category?: ExpenseCategory
  card_last_four?: string
  sort_by?: 'date' | 'amount' | 'merchant'
  sort_order?: 'asc' | 'desc'
}

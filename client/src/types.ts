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
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// All categories that count as IRS-qualified 529 expenses
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
];

// Categories that count against the Housing & Food COA limit
export const HOUSING_FOOD_CATEGORIES: ExpenseCategory[] = [
  'Housing & Food',
  'Food & Groceries',
];

// ── Purpose Sub-categories ────────────────────────────────────────────────────

export const SUB_PURPOSE_MAP: Record<ExpenseCategory, readonly string[]> = {
  'Tuition & Fees':           ['Enrollment Fee', 'Lab Fee', 'Activity Fee', 'Course Fee', 'Other'],
  'Housing & Food':           ['Rent', 'Utilities', 'Dining Hall', 'Other'],
  'Food & Groceries':         ['Groceries', 'Dining', 'Meal Plan', 'Other'],
  'Books & Course Supplies':  ['Textbooks', 'Notebooks', 'Lab Supplies', 'Art Supplies', 'Course Materials', 'Other'],
  'Technology':               ['Software', 'Hardware', 'Accessories', 'Subscription', 'Other'],
  'Special Needs Services':   ['Therapy', 'Adaptive Equipment', 'Support Services', 'Other'],
  'Apprenticeship Programs':  ['Program Fee', 'Materials', 'Other'],
  'Student Loan Repayment':   ['Principal', 'Interest', 'Other'],
  'K-12 Tuition':             ['Tuition Payment', 'Activity Fee', 'Other'],
  'Other':                    ['Other'],
};

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
] as const;

// ── Cost of Attendance ────────────────────────────────────────────────────────

export interface CostOfAttendance {
  tuition: number;
  housing_food: number;   // combined housing + food allowance per school's COA
  books_supplies: number;
  other: number;
}

export const DEFAULT_COA: CostOfAttendance = {
  tuition: 0,
  housing_food: 0,
  books_supplies: 0,
  other: 0,
};

// ── Core Receipt ──────────────────────────────────────────────────────────────

export interface Receipt {
  id: string;
  date: string;           // YYYY-MM-DD
  merchant: string;
  amount: number;
  category: ExpenseCategory;
  purpose_sub: string | null;  // sub-category from SUB_PURPOSE_MAP
  purpose: string | null;      // free-text description (used when purpose_sub = 'Other' or legacy)
  card_last_four: string | null;
  image_uri: string | null;
  is_qualified: boolean;
  created_at: string;
}

export type ReceiptCreate = Omit<Receipt, 'id' | 'is_qualified' | 'created_at'>;
export type ReceiptUpdate = Partial<ReceiptCreate>;

// ── Claude Parsing ────────────────────────────────────────────────────────────

export interface ParsedReceiptFields {
  date: string | null;
  merchant: string | null;
  amount: number | null;
  suggested_category: ExpenseCategory | null;
  suggested_purpose: string | null;        // sub-category from SUB_PURPOSE_MAP
  suggested_description: string | null;    // free text when suggested_purpose = 'Other'
  card_last_four: string | null;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface CategorySummary {
  category: ExpenseCategory;
  total: number;
  count: number;
  is_qualified: boolean;
}

export interface CoaUtilization {
  tuition_spent: number;
  housing_food_spent: number;
  books_supplies_spent: number;
  tuition_limit: number;
  housing_food_limit: number;
  books_supplies_limit: number;
}

export interface MonthlySpend {
  year: number;
  month: number;
  total: number;
  by_category: CategorySummary[];
}

export interface ReportSummary {
  start_date: string;
  end_date: string;
  total_qualified: number;
  total_non_qualified: number;
  by_category: CategorySummary[];
  by_month: MonthlySpend[];
}

export interface MerchantSummary {
  merchant: string;
  total: number;
  count: number;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReceiptFilters {
  start_date?: string;
  end_date?: string;
  category?: ExpenseCategory;
  card_last_four?: string;
  sort_by?: 'date' | 'amount' | 'merchant';
  sort_order?: 'asc' | 'desc';
}

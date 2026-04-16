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
  purpose: string | null;
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
  purpose: string | null;
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

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ReceiptFilters {
  start_date?: string;
  end_date?: string;
  category?: ExpenseCategory;
  card_last_four?: string;
  sort_by?: 'date' | 'amount' | 'merchant';
  sort_order?: 'asc' | 'desc';
}

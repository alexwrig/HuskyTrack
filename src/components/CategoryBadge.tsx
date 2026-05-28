import type { ExpenseCategory } from '../types'

const COLORS: Record<ExpenseCategory, string> = {
  'Tuition & Fees':          'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  'Housing & Food':          'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'Food & Groceries':        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Books & Course Supplies': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'Technology':              'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'Special Needs Services':  'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  'Apprenticeship Programs': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Student Loan Repayment':  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'K-12 Tuition':            'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Other':                   'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
}

export function CategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${COLORS[category]}`}>
      {category}
    </span>
  )
}

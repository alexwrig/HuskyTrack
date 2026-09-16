import { EXPENSE_CATEGORIES } from '../types'
import type { ExpenseCategory } from '../types'

type SpreadsheetRow = { date: string; merchant: string; amount: number; category: string; card_last_four: string | null }

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1].trim() : trimmed
  return JSON.parse(raw)
}

export async function parseSpreadsheetRows(
  rows: Record<string, unknown>[],
  instructions: string,
): Promise<SpreadsheetRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set.')

  const categoryList = EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(', ')
  const compact = JSON.stringify(rows.slice(0, 200))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: 'You are a data extraction tool. You output ONLY raw JSON arrays, no explanation, no markdown, no code fences. Your entire response must start with [ and end with ].',
      messages: [
        {
          role: 'user',
          content: `Parse this bank/card statement spreadsheet for a 529 education expense tracker.

User instructions: ${instructions}

For each row that matches the instructions, output a JSON object with:
- date: YYYY-MM-DD string
- merchant: vendor/store name string
- amount: positive number (if the statement shows purchases as negative, flip the sign)
- category: one of [${categoryList}]
- card_last_four: last 4 digits as string, or null

Rules:
- Apply the user instructions to decide which rows to include.
- Skip payments, credits, balance transfers, and fees unless told otherwise.
- If amounts are in separate Debit/Credit columns, use Debit.
- If no rows match, return [].

Spreadsheet data:
${compact}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as { message?: string })?.message ?? `API error ${response.status}`)
  }

  const data = await response.json() as { content: { type: string; text: string }[] }
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : '[]'

  try {
    const parsed = extractJSON(text)
    if (Array.isArray(parsed)) return parsed as SpreadsheetRow[]
    return []
  } catch {
    return []
  }
}

// ── Credit card / bank statement PDF import ──────────────────────────────────
// Many card issuers only offer PDF statements (no CSV/XLSX export), so PDFs
// are parsed the same way as a spreadsheet -- extract every transaction row
// -- rather than as a single receipt. Uses Claude's vision/document support
// directly on the PDF, no separate OCR or PDF-to-image conversion step.

export async function parseStatementFile(
  fileBase64: string,
  instructions: string,
): Promise<SpreadsheetRow[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set.')

  const categoryList = EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(', ')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-beta': 'pdfs-2024-09-25',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: 'You are a data extraction tool. You output ONLY raw JSON arrays, no explanation, ' +
        'no markdown, no code fences. Your entire response must start with [ and end with ].',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
            {
              type: 'text',
              text: `Parse every transaction row on this bank/credit card statement for a 529 education expense tracker.

User instructions: ${instructions || '(none)'}

For each transaction, output a JSON object with:
- date: YYYY-MM-DD string
- merchant: vendor/store name string
- amount: positive number (if the statement shows purchases as negative, flip the sign)
- category: one of [${categoryList}]
- card_last_four: last 4 digits as string, or null

Rules:
- Read every page and every transaction row, not just the first page.
- Apply the user instructions to decide which rows to include.
- Skip payments, credits, balance transfers, and fees unless told otherwise.
- If no rows match, return [].
Return ONLY the JSON array.`,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as { message?: string })?.message ?? `API error ${response.status}`)
  }

  const data = await response.json() as { content: { type: string; text: string }[] }
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text.trim() : '[]'

  try {
    const parsed = extractJSON(text)
    if (Array.isArray(parsed)) return parsed as SpreadsheetRow[]
    return []
  } catch {
    return []
  }
}

// ── Plaid transaction classification ─────────────────────────────────────────
// Plaid's own categories (e.g. "FOOD_AND_DRINK") have no concept of 529
// education-expense qualification, so each new/modified transaction is
// classified into one of our categories via Claude. Batched (not one call
// per transaction) since a sync can return many transactions at once.

const CLASSIFY_BATCH_SIZE = 40

interface ClassifyInput {
  merchant: string
  plaidCategory: string | null
  amount: number
}

interface ClassifyResult {
  category: ExpenseCategory
  confidence: number
}

async function classifyBatch(items: ClassifyInput[]): Promise<ClassifyResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set.')

  const categoryList = EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(', ')
  const compact = items.map((t, i) => ({ i, merchant: t.merchant, bank_category: t.plaidCategory, amount: t.amount }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: 'You are a transaction classifier for a 529 education expense tracker. ' +
        'You output ONLY a raw JSON array, no explanation, no markdown, no code fences.',
      messages: [
        {
          role: 'user',
          content: `Classify each bank transaction below into exactly one 529 category.
Allowed categories: ${categoryList}.
Category hints: grocery stores and restaurants -> "Food & Groceries"; rent, utilities, dorms -> "Housing & Food"; ` +
            `textbooks, school/office supplies -> "Books & Course Supplies"; computers, software, electronics -> "Technology"; ` +
            `tuition/university payments -> "Tuition & Fees"; anything clearly personal/non-education (entertainment, ` +
            `general retail, travel, etc.) -> "Other". Use the bank's own category as a hint, but the merchant name matters more.

Return a JSON array with one object per transaction, in the same order, each with:
{"i":index,"category":"one of the allowed categories","confidence":number from 0 to 1}
Lower confidence when the merchant name is ambiguous or generic.

Transactions:
${JSON.stringify(compact)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as { message?: string })?.message ?? `API error ${response.status}`)
  }

  const data = await response.json() as { content: { type: string; text: string }[] }
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '[]'

  let raw: unknown
  try {
    raw = extractJSON(text)
  } catch {
    raw = []
  }

  const byIndex = new Map<number, ClassifyResult>()
  if (Array.isArray(raw)) {
    for (const entry of raw as Record<string, unknown>[]) {
      const i = entry.i as number
      const category = (EXPENSE_CATEGORIES as readonly string[]).includes(entry.category as string)
        ? entry.category as ExpenseCategory
        : 'Other'
      const confidence = typeof entry.confidence === 'number' ? entry.confidence : 0
      byIndex.set(i, { category, confidence })
    }
  }

  return items.map((_, i) => byIndex.get(i) ?? { category: 'Other', confidence: 0 })
}

export async function classifyPlaidTransactions(items: ClassifyInput[]): Promise<ClassifyResult[]> {
  if (items.length === 0) return []

  const results: ClassifyResult[] = []
  for (let i = 0; i < items.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = items.slice(i, i + CLASSIFY_BATCH_SIZE)
    try {
      results.push(...await classifyBatch(batch))
    } catch {
      // Classification failing shouldn't block the sync from storing the
      // transaction -- it just lands as "Other" for manual correction.
      results.push(...batch.map((): ClassifyResult => ({ category: 'Other', confidence: 0 })))
    }
  }
  return results
}

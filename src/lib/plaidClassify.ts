import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type PlaidTransactionDetails } from '../types'

// How a bank transaction got its category. 'user' is never overwritten;
// 'unclassified' means classification failed and is retried on the next sync.
export type CategorySource = 'user' | 'rule' | 'ai' | 'inherited' | 'unclassified'

export interface BankClassifyInput {
  merchant: string
  amount: number
  details: PlaidTransactionDetails
}

export interface BankClassification {
  category: ExpenseCategory
  confidence: number
  source: 'rule' | 'ai'
}

// ── 1. Rules ─────────────────────────────────────────────────────────────────
// Unambiguous Plaid categories map straight to ours, so the bulk of everyday
// spending never depends on a model call. Only applied when Plaid itself is
// confident; everything else goes to Claude with full context.

// UW dining / Husky Card spending is board (Housing & Food), not restaurant
// food -- matches how these were categorized in uploaded receipts.
const CAMPUS_DINING = /\buw\b.*\b(food|dining|hfs|housing)|\bhusky card\b|\bhfs\b/i

const DETAILED_RULES: Record<string, ExpenseCategory> = {
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'Books & Course Supplies',
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES:           'Books & Course Supplies',
  GENERAL_MERCHANDISE_ELECTRONICS:               'Technology',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES:  'Other',
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT:            'Student Loan Repayment',
  RENT_AND_UTILITIES_RENT:                       'Housing & Food',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY:        'Housing & Food',
  RENT_AND_UTILITIES_WATER:                      'Housing & Food',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Housing & Food',
  ENTERTAINMENT_TV_AND_MOVIES:                   'Entertainment',
  ENTERTAINMENT_MUSIC_AND_AUDIO:                 'Entertainment',
  ENTERTAINMENT_VIDEO_GAMES:                     'Entertainment',
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: 'Entertainment',
  ENTERTAINMENT_CASINOS_AND_GAMBLING:            'Entertainment',
}

const PRIMARY_RULES: Record<string, ExpenseCategory> = {
  FOOD_AND_DRINK: 'Food & Groceries',
  TRANSPORTATION: 'Transportation',
  PERSONAL_CARE:  'Other',
  MEDICAL:        'Other',
}

function ruleCategory(input: BankClassifyInput): ExpenseCategory | null {
  const d = input.details
  const text = `${input.merchant} ${d.name} ${d.original_description ?? ''}`
  if (CAMPUS_DINING.test(text)) return 'Housing & Food'

  // Plaid's enrichment is much weaker for foreign merchants (e.g. a Korean
  // bowling alley labeled "restaurant" with HIGH confidence). Domestic
  // charges carry a 2-letter state; anything else goes to Claude.
  const domestic = /^[A-Z]{2}$/.test(d.location.region ?? '')
  const confident = d.category_confidence === 'VERY_HIGH' || d.category_confidence === 'HIGH'
  if (!domestic || !confident) return null
  if (d.category_detailed && DETAILED_RULES[d.category_detailed]) return DETAILED_RULES[d.category_detailed]
  if (d.category_primary && PRIMARY_RULES[d.category_primary]) return PRIMARY_RULES[d.category_primary]
  return null
}

// ── 2. Claude ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 40
const CONCURRENCY = 4

const ResultSchema = z.object({
  results: z.array(z.object({
    i: z.number().int(),
    category: z.enum(EXPENSE_CATEGORIES),
    confidence: z.number(),
  })),
})

const SYSTEM_PROMPT = `You categorize a UW (University of Washington, Seattle) student's card transactions for a 529 education-savings expense tracker. Pick exactly one category per transaction.

Categories and when to use them:
- "Tuition & Fees": tuition, enrollment, lab, or course fees paid to a school.
- "Housing & Food": rent, dorms, utilities, university housing, campus dining / meal plans (UW Housing & Food Services, Husky Card), furniture for the student's room (e.g. IKEA).
- "Food & Groceries": grocery stores, restaurants, cafes, fast food, bubble tea, campus concessions run by outside vendors, convenience-store food.
- "Books & Course Supplies": textbooks, bookstores, school and office supplies, printing.
- "Technology": computers, tablets, software, electronics, internet service (e.g. a large Apple Store purchase).
- "Transportation": rideshare, taxis, transit, scooters/bikes (Lime), parking, gas, flights.
- "Entertainment": streaming, movies, concerts, events, games (any merchant with "games" in the name, arcades, game rooms), museums.
- "Student Loan Repayment": payments to a student loan servicer.
- "Special Needs Services", "Apprenticeship Programs", "K-12 Tuition": only when clearly applicable.
- "Other": everything else that is personal and not education-related: clothing, general retail and superstores (Target, Walmart), gifts, flowers, salons and beauty (including booking apps like Booksy -- not books), laundry, medical and pharmacy, phone plans, postage, government fees and visas, transfers and payment apps.

How to decide:
- The bank description and Plaid's detailed category are the strongest signals; the merchant name can be misleading (Plaid sometimes mis-enriches it).
- Many charges are foreign (often Korean, romanized). Words like JOOSIKHOISA (= "corporation") say nothing about food; rely on Plaid's category and only choose a food category when there is real evidence.
- If the user has corrected similar merchants (listed below the transactions when present), follow their corrections.
- confidence is 0 to 1: how sure you are. Use below 0.6 when the evidence is thin.

Return one result per transaction, using its "i".`

let cachedClient: Anthropic | null = null
function getClient(): Anthropic {
  cachedClient ??= new Anthropic()
  return cachedClient
}

async function classifyBatch(
  batch: { index: number; input: BankClassifyInput }[],
  corrections: { merchant: string; category: ExpenseCategory }[],
): Promise<Map<number, { category: ExpenseCategory; confidence: number }>> {
  const items = batch.map(({ index, input }) => ({
    i: index,
    merchant: input.merchant,
    bank_description: input.details.original_description,
    plaid_category: input.details.category_detailed ?? input.details.category_primary,
    plaid_confidence: input.details.category_confidence,
    channel: input.details.payment_channel,
    amount: input.amount,
    city: input.details.location.city,
  }))

  let content = `Transactions:\n${JSON.stringify(items)}`
  if (corrections.length > 0) content += `\n\nUser corrections (merchant -> category):\n${JSON.stringify(corrections)}`

  const response = await getClient().beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    // Short, rule-driven task: low effort is plenty.
    output_config: { effort: 'low', format: betaZodOutputFormat(ResultSchema) },
    // Retry on a fallback model if the request is ever declined.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') throw new Error('Classification request was declined')
  const parsed = response.parsed_output
  if (!parsed) throw new Error(`Classification returned no parseable output (stop_reason=${response.stop_reason})`)

  const wanted = new Set(batch.map((b) => b.index))
  const out = new Map<number, { category: ExpenseCategory; confidence: number }>()
  for (const r of parsed.results) {
    if (wanted.has(r.i)) out.set(r.i, { category: r.category, confidence: Math.min(1, Math.max(0, r.confidence)) })
  }
  return out
}

// ── Entry point ──────────────────────────────────────────────────────────────

// Returns one result per input, in order; null where classification failed
// (the caller stores those as 'unclassified' so the next sync retries them).
export async function classifyBankTransactions(
  inputs: BankClassifyInput[],
  corrections: { merchant: string; category: ExpenseCategory }[] = [],
): Promise<(BankClassification | null)[]> {
  const results: (BankClassification | null)[] = new Array(inputs.length).fill(null)
  const correctionByMerchant = new Map(corrections.map((c) => [c.merchant.trim().toLowerCase(), c.category]))

  const forModel: { index: number; input: BankClassifyInput }[] = []
  inputs.forEach((input, index) => {
    const corrected = correctionByMerchant.get(input.merchant.trim().toLowerCase())
    if (corrected) {
      // Following a correction isn't itself a user edit, so it stays re-classifiable.
      results[index] = { category: corrected, confidence: 1, source: 'rule' }
      return
    }
    const ruled = ruleCategory(input)
    if (ruled) {
      results[index] = { category: ruled, confidence: 0.95, source: 'rule' }
      return
    }
    forModel.push({ index, input })
  })

  const batches: typeof forModel[] = []
  for (let i = 0; i < forModel.length; i += BATCH_SIZE) batches.push(forModel.slice(i, i + BATCH_SIZE))
  const relevantCorrections = corrections.slice(0, 50)

  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      let classified: Map<number, { category: ExpenseCategory; confidence: number }> | null = null
      for (let attempt = 0; attempt < 2 && !classified; attempt++) {
        try {
          classified = await classifyBatch(batch, relevantCorrections)
        } catch (err) {
          console.error('[classify] batch failed', { attempt, size: batch.length, error: err instanceof Error ? err.message : err })
        }
      }
      for (const { index } of batch) {
        const r = classified?.get(index)
        if (r) results[index] = { ...r, source: 'ai' }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  return results
}

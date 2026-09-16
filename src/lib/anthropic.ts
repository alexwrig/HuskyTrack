import { EXPENSE_CATEGORIES } from '../types'
import type { ExpenseCategory } from '../types'

type SpreadsheetRow = {
  date: string
  merchant: string
  amount: number
  category: string
  card_last_four: string | null
  card_name?: string | null
  city?: string | null
  state?: string | null
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1].trim() : trimmed
  try {
    return JSON.parse(raw)
  } catch {
    // Tool-use turns sometimes append trailing reasoning ("...ready to
    // compile.\n\n[...]") before/after the array despite instructions to
    // output only JSON. Fall back to slicing out the outermost [...].
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON array found in response')
    return JSON.parse(raw.slice(start, end + 1))
  }
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
      // Same low-cost, capped web search as parseStatementFile -- see there
      // for why it's needed and why it's capped this low.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      system: 'You are a data extraction tool for a personal finance app. You may use the web_search ' +
        'tool if instructed to, but your FINAL message must be ONLY a raw JSON array, no explanation, ' +
        'no markdown, no code fences -- it must start with [ and end with ].',
      messages: [
        {
          role: 'user',
          content: `Parse this bank/card statement spreadsheet for a 529 education expense tracker.

User instructions: ${instructions || '(none -- include every purchase row automatically)'}

For each row that matches the instructions, output a JSON object with:
- date: YYYY-MM-DD string
- merchant: cleaned-up vendor/store name string (see cleanup rules below)
- amount: positive number (if the statement shows purchases as negative, flip the sign)
- category: one of [${categoryList}]. Any merchant name containing "games" (arcades, game stores, campus game rooms, video games) -> "Entertainment". Rideshare/transit merchants (Uber, Lyft, Waymo, Orca, public transit, buses, trains, parking) -> "Transportation".
- card_name: the card's issuer/product name (e.g. "Amex", "Chase Freedom Unlimited") if it's identifiable from the data, a column, or the instructions -- otherwise null. Do not output digits here.
- city: the city the purchase was made in, or null if unknown (see location rules below)
- state: the state/region abbreviation or code, or null if unknown

Merchant name cleanup rules:
- Raw descriptors are often processor text like "SQ *COFFEE SHOP", "APLPAY AMAZON.COM", "AplPay TFL TRAVEL", "TST* PIZZA PLACE", "PAYPAL *SOMENAME", sometimes in caps, with trailing store numbers, reference codes, or country codes.
- Strip payment-processor/wallet prefixes (SQ *, TST*, APLPAY, APL PAY, AplPay, PAYPAL *, PP*, GOOGLE *, IC*, CKO*, and similar) so only the underlying business name remains.
- Strip trailing store numbers, reference codes, phone numbers, and country/postal codes that aren't part of the business's actual name.
- Rewrite ALL CAPS or mashed-together names into normal, natural capitalization and spacing (e.g. "GPUK*TACO BELLONDON" -> "Taco Bell"), preserving real stylized brand names (e.g. "McDonald's").

Location rules (apply in this order, stop as soon as one gives an answer):
1. If the row's own text already shows a city (or a city/region code, e.g. a UK postcode area, a US state), use it directly.
2. Otherwise, if you already recognize the business as a specific, real, limited-location establishment (not a large multi-location chain), use what you already know.
3. If it's a large national/multi-location chain (e.g. Amazon, Starbucks, Target) with no location shown in the row, its specific transaction location cannot be determined from the name alone -- leave city and state null. Do not guess a location for a chain.
4. Only if the name is unfamiliar, doesn't look like a recognizable chain, AND you cannot determine its city from the row's text or your own knowledge, you may use the web_search tool to look it up. Use it sparingly (at most 3 searches for this entire file) -- reserve it for names that genuinely look like a specific local business worth identifying.

Other rules:
- Apply the user instructions to decide which rows to include.
- Skip payments, credits, balance transfers, and fees unless told otherwise.
- If amounts are in separate Debit/Credit columns, use Debit.
- If no rows match, return [].

Spreadsheet data:
${compact}

Your final message must be ONLY the JSON array.`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as { message?: string })?.message ?? `API error ${response.status}`)
  }

  const data = await response.json() as { content: { type: string; text?: string }[] }
  const textBlocks = (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string')
  const text = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1].text as string).trim() : '[]'

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
      // Web search is a paid, per-call server-side tool (plus the tokens for
      // whatever it fetches), so it's capped low and the prompt tells Claude
      // to reach for it only as a last resort, not for every unclear name.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      system: 'You are a data extraction tool for a personal finance app. You may use the web_search ' +
        'tool if instructed to, but your FINAL message must be ONLY a raw JSON array, no explanation, ' +
        'no markdown, no code fences -- it must start with [ and end with ].',
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
- merchant: cleaned-up vendor/store name string (see cleanup rules below)
- amount: positive number (if the statement shows purchases as negative, flip the sign)
- category: one of [${categoryList}]. Any merchant name containing "games" (arcades, game stores, campus game rooms, video games) -> "Entertainment". Rideshare/transit merchants (Uber, Lyft, Waymo, Orca, public transit, buses, trains, parking) -> "Transportation".
- card_name: the card's issuer and/or product name (e.g. "Amex", "Chase Freedom Unlimited", "Discover it"), read once from the statement's own header/branding/logo -- use the SAME value for every transaction in this statement, since one statement file is one card account. Do not output digits here.
- city: the city the purchase was made in, or null if unknown (see location rules below)
- state: the two-letter state abbreviation, or null if unknown

Merchant name cleanup rules:
- Statement descriptors are often raw processor text like "SQ *COFFEE SHOP", "APLPAY AMAZON.COM", "TST* PIZZA PLACE", "PAYPAL *SOMENAME", all in caps, with trailing store numbers or reference codes.
- Strip payment-processor/wallet prefixes (SQ *, TST*, APLPAY, APL PAY, PAYPAL *, PP*, GOOGLE *, IC*, CKO*, and similar) so only the underlying business name remains.
- Strip trailing store numbers, reference codes, and phone numbers that aren't part of the business's actual name.
- Rewrite ALL CAPS names into normal, natural capitalization (e.g. "STARBUCKS #4471 SEATTLE WA" -> "Starbucks"), preserving real stylized brand names (e.g. "McDonald's", "iTunes").

Location rules (apply in this order, stop as soon as one gives an answer):
1. ALWAYS check the statement's own text for that specific row FIRST, even for a well-known national chain. Many issuers print a city/state (or full address) as part of or after the merchant descriptor -- e.g. "STARBUCKS #4471 SEATTLE WA" means city="Seattle", state="WA", and "TARGET T-1234 MINNEAPOLIS MN" means city="Minneapolis", state="MN". If a location is printed on that row, use it, regardless of whether the merchant is a big chain.
2. Only when NO location is printed on that row: if you already recognize the business as a specific, real, limited-location establishment (not a large multi-location chain), use what you already know.
3. Only when NO location is printed on that row AND it's a large national/multi-location chain (e.g. Amazon, Starbucks, Target): its specific transaction location cannot be determined from the name alone -- leave city and state null. Do not guess a location for a chain when nothing is printed.
4. Only when NO location is printed on that row AND the name is unfamiliar, doesn't look like a recognizable chain, AND you cannot determine its city from your own knowledge, you may use the web_search tool to look it up. Use it sparingly (you have at most 3 searches for this entire statement) -- reserve it for names that genuinely look like a specific local business worth identifying, not generic or already-known merchants.

Other rules:
- Read every page and every transaction row, not just the first page.
- Apply the user instructions to decide which rows to include.
- Skip payments, credits, balance transfers, and fees unless told otherwise.
- If no rows match, return [].
Your final message must be ONLY the JSON array.`,
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

  const data = await response.json() as { content: { type: string; text?: string }[] }
  // Web search adds server_tool_use / web_search_tool_result blocks before
  // the final answer, so the JSON is in the LAST text block, not content[0].
  const textBlocks = (data.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string')
  const text = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1].text as string).trim() : '[]'

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
            `tuition/university payments -> "Tuition & Fees"; any merchant name containing "games" (arcades, game stores, ` +
            `campus game rooms, video game purchases, etc.) -> "Entertainment"; other entertainment (streaming, movies, ` +
            `events, concerts) -> "Entertainment"; rideshare and transit (Uber, Lyft, Waymo, Orca, public transit, buses, ` +
            `trains, parking) -> "Transportation"; anything else clearly personal/non-education (general retail, etc.) ` +
            `-> "Other". Use the bank's own category as a hint, but the merchant name matters more.

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

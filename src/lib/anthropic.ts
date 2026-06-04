import type { ParsedReceiptFields, ExpenseCategory } from '../types'
import { EXPENSE_CATEGORIES, ALL_SUB_PURPOSES } from '../types'

const SYSTEM_PROMPT =
  'You are a receipt parser for a 529 education expense tracker. ' +
  'Extract structured data and respond ONLY in valid JSON with no markdown fences. ' +
  'Category hints: grocery stores and restaurants -> "Food & Groceries"; ' +
  'rent, utilities, dorms -> "Housing & Food"; ' +
  'textbooks, school supplies, course materials -> "Books & Course Supplies"; ' +
  'tuition payments, university fees -> "Tuition & Fees". ' +
  'Purpose hints: for each category choose the most specific sub-purpose. ' +
  'If nothing fits, use "Other" and provide a brief description.'

const USER_PROMPT = (categories: string, purposes: string) =>
  `Parse this receipt/document and return JSON with exactly these fields:
{"date":"YYYY-MM-DD or null","merchant":"store name or null","amount":number or null,` +
  `"suggested_category":"one of the allowed categories or null",` +
  `"suggested_purpose":"one of the allowed purposes or null",` +
  `"suggested_description":"brief text if suggested_purpose is Other, else null",` +
  `"card_last_four":"4 digits or null"}
Allowed categories: ${categories}.
Allowed purposes: ${purposes}.
Use "Other" for suggested_category only if it does not fit any 529 expense.
Return ONLY the JSON object.`

export async function parseReceiptFile(
  fileBase64: string,
  mimeType: string,
): Promise<ParsedReceiptFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set.')

  const categoryList = EXPENSE_CATEGORIES.map((c) => `"${c}"`).join(', ')
  const purposeList = [...ALL_SUB_PURPOSES].map((p) => `"${p}"`).join(', ')

  const isPdf = mimeType === 'application/pdf'
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: USER_PROMPT(categoryList, purposeList) },
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
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : ''

  let parsed: ParsedReceiptFields
  try {
    parsed = JSON.parse(text) as ParsedReceiptFields
  } catch {
    parsed = {
      date: null, merchant: null, amount: null,
      suggested_category: null, suggested_purpose: null,
      suggested_description: null, card_last_four: null,
    }
  }

  if (parsed.suggested_category && !(EXPENSE_CATEGORIES as readonly string[]).includes(parsed.suggested_category)) {
    parsed.suggested_category = 'Other' as ExpenseCategory
  }

  if (parsed.suggested_purpose && !([...ALL_SUB_PURPOSES] as string[]).includes(parsed.suggested_purpose)) {
    parsed.suggested_purpose = 'Other'
  }

  if (typeof parsed.amount === 'string') {
    const n = parseFloat((parsed.amount as string).replace(/[^0-9.]/g, ''))
    parsed.amount = isNaN(n) ? null : n
  }

  return parsed
}

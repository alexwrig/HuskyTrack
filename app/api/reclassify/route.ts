import { NextResponse } from 'next/server'
import { listReceipts, updateReceipt, ensureTable } from '@/src/lib/db'
import { classifyPlaidTransactions } from '@/src/lib/anthropic'
import { reclassifyBankTransactions } from '@/src/lib/plaidSync'

export const runtime = 'nodejs'
export const maxDuration = 300

// "Reclassify Other": retries the AI category for everything still marked
// "Other". Bank transactions go through the Plaid-aware classifier (which
// skips categories the user set by hand); uploaded receipts only have a
// merchant name to go on.
export async function POST() {
  try {
    await ensureTable()

    const bank = await reclassifyBankTransactions({ scope: 'other' })

    const others = (await listReceipts()).filter((r) => r.category === 'Other')
    let receiptsReclassified = 0
    if (others.length > 0) {
      const results = await classifyPlaidTransactions(
        others.map((t) => ({ merchant: t.merchant, plaidCategory: null, amount: t.amount })),
      )
      for (let i = 0; i < others.length; i++) {
        const newCategory = results[i]?.category
        if (newCategory && newCategory !== 'Other') {
          await updateReceipt(others[i].id, { category: newCategory })
          receiptsReclassified++
        }
      }
    }

    return NextResponse.json({
      checked: bank.checked + others.length,
      reclassified: bank.changed.length + receiptsReclassified,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

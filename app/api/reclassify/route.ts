import { NextResponse } from 'next/server'
import { listAllTransactions, updateTransaction, ensureTable } from '@/src/lib/db'
import { classifyPlaidTransactions } from '@/src/lib/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST() {
  try {
    await ensureTable()
    const transactions = await listAllTransactions()
    const others = transactions.filter((t) => t.category === 'Other')

    if (others.length === 0) {
      return NextResponse.json({ checked: 0, reclassified: 0 })
    }

    const results = await classifyPlaidTransactions(
      others.map((t) => ({ merchant: t.merchant, plaidCategory: null, amount: t.amount })),
    )

    let reclassified = 0
    for (let i = 0; i < others.length; i++) {
      const newCategory = results[i]?.category
      if (newCategory && newCategory !== 'Other') {
        await updateTransaction(others[i].id, { category: newCategory })
        reclassified++
      }
    }

    return NextResponse.json({ checked: others.length, reclassified })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

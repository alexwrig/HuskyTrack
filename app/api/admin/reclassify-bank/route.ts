import { NextRequest, NextResponse } from 'next/server'
import { ensureTable } from '@/src/lib/db'
import { reclassifyBankTransactions } from '@/src/lib/plaidSync'

export const runtime = 'nodejs'
export const maxDuration = 300

// Admin-only (middleware gates /api/admin): re-run classification over every
// bank transaction the user hasn't categorized by hand. ?dry_run=1 previews.
export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    const dryRun = request.nextUrl.searchParams.get('dry_run') === '1'
    const result = await reclassifyBankTransactions({ scope: 'all', dryRun })
    return NextResponse.json({ dry_run: dryRun, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { findDuplicateGroups, ensureTable } from '@/src/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await ensureTable()
    const groups = await findDuplicateGroups()
    return NextResponse.json(groups)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { deleteDuplicates, ensureTable } from '@/src/lib/db'
import type { DuplicateGroup } from '@/src/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json() as { groups: DuplicateGroup[] }
    if (!body.groups?.length) return NextResponse.json({ error: 'No groups provided' }, { status: 400 })

    const deletedIds = await deleteDuplicates(body.groups)
    return NextResponse.json({ ok: true, deletedIds })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

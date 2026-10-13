import { NextRequest, NextResponse } from 'next/server'
import { getPlaidErrorInfo } from '@/src/lib/plaid'
import { ensureTable, listPlaidItems } from '@/src/lib/db'
import { syncPlaidItem, type SyncResult } from '@/src/lib/plaidSync'

export const runtime = 'nodejs'
// A first sync can pull two years of history and classify it all.
export const maxDuration = 300

interface ItemSyncOutcome {
  item_id: string
  institution_name: string | null
  ok: boolean
  result?: SyncResult
  error?: string
  error_code?: string | null
}

// Body (optional): { item_id } to sync one item; otherwise syncs all of them.
// Always 200 with per-item outcomes so one broken bank doesn't hide the
// others' results; the UI surfaces each item's error.
export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    const body = await request.json().catch(() => ({})) as { item_id?: string }

    const items = (await listPlaidItems()).filter((i) => !body.item_id || i.id === body.item_id)
    if (body.item_id && items.length === 0) {
      return NextResponse.json({ error: 'Linked account not found' }, { status: 404 })
    }

    const outcomes: ItemSyncOutcome[] = []
    for (const item of items) {
      try {
        const result = await syncPlaidItem(item.id)
        outcomes.push({ item_id: item.id, institution_name: item.institution_name, ok: true, result })
      } catch (err) {
        // syncPlaidItem already logged error_code/request_id server-side.
        const info = getPlaidErrorInfo(err)
        outcomes.push({
          item_id: item.id,
          institution_name: item.institution_name,
          ok: false,
          error: info.message,
          error_code: info.error_code,
        })
      }
    }

    return NextResponse.json({ ok: outcomes.every((o) => o.ok), items: outcomes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

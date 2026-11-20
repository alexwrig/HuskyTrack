import { NextRequest, NextResponse } from 'next/server'
import { ensureTable } from '@/src/lib/db'
import { requireAdmin } from '@/src/lib/requireAdmin'
import { setAutoParse } from '@/src/lib/emailReceipts'

export const runtime = 'nodejs'

// Body: { auto_parse: boolean }. Admin only.
export async function PUT(request: NextRequest) {
  const forbidden = await requireAdmin(request)
  if (forbidden) return forbidden
  try {
    const body = await request.json().catch(() => ({})) as { auto_parse?: unknown }
    if (typeof body.auto_parse !== 'boolean') {
      return NextResponse.json({ error: 'auto_parse must be true or false' }, { status: 400 })
    }
    await ensureTable()
    await setAutoParse(body.auto_parse)
    return NextResponse.json({ auto_parse: body.auto_parse })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

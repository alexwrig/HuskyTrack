// Renames existing receipts + bank-synced transactions per
// src/lib/merchantAliases.json (new rows are normalized on save already).
// Dry run by default; pass --apply to write. The activity log is left
// untouched as the historical record of what came in.
//
//   node --env-file=.env.local scripts/apply-merchant-aliases.mjs [--apply]

import { readFileSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { neon } from '@neondatabase/serverless'

const apply = process.argv.includes('--apply')
const aliases = JSON.parse(readFileSync(new URL('../src/lib/merchantAliases.json', import.meta.url), 'utf8'))
  .map((a) => ({ name: a.name, pattern: new RegExp(a.match, 'i') }))
const normalize = (m) => aliases.find((a) => a.pattern.test(m))?.name ?? m

const key = Buffer.from(process.env.PLAID_ENCRYPTION_KEY, 'base64')
function decrypt(stored) {
  const [iv, tag, ct] = stored.split(':')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString('utf8')
}
function encrypt(plaintext) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), ct.toString('hex')].join(':')
}

const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL)
const changes = {}
const note = (from, to) => { const k = `${from}  ->  ${to}`; changes[k] = (changes[k] ?? 0) + 1 }

for (const r of await sql`SELECT id, merchant FROM receipts`) {
  const to = normalize(r.merchant)
  if (to === r.merchant) continue
  note(`[receipt] ${r.merchant}`, to)
  if (apply) await sql`UPDATE receipts SET merchant = ${to} WHERE id = ${r.id}`
}

for (const t of await sql`SELECT id, merchant FROM plaid_transactions`) {
  const from = decrypt(t.merchant)
  const to = normalize(from)
  if (to === from) continue
  note(`[bank]    ${from}`, to)
  if (apply) await sql`UPDATE plaid_transactions SET merchant = ${encrypt(to)}, updated_at = NOW() WHERE id = ${t.id}`
}

console.table(changes)
console.log(apply ? 'Applied.' : 'Dry run. Re-run with --apply to write these changes.')

// Encrypts legacy plaintext rows in receipts, activity_log, and review_queue
// (the app encrypts new rows itself and reads either form). Idempotent: rows
// already encrypted are skipped. Dry run by default.
//
//   node --env-file=.env.local scripts/encrypt-existing-data.mjs [--apply] [--backup <file>]
//
// --backup writes the original values of every row it will change to
// <file>, itself encrypted with PLAID_ENCRYPTION_KEY, before any update.

import { writeFileSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { neon } from '@neondatabase/serverless'

const TABLES = {
  receipts:     ['date', 'merchant', 'amount', 'category', 'purpose_sub', 'purpose', 'card_last_four', 'card_name', 'city', 'state'],
  activity_log: ['merchant', 'amount', 'date', 'category', 'city', 'state'],
  review_queue: ['from_address', 'subject', 'file_name', 'file_base64', 'email_text', 'parsed', 'reason'],
}

const apply = process.argv.includes('--apply')
const backupIdx = process.argv.indexOf('--backup')
const backupPath = backupIdx > -1 ? process.argv[backupIdx + 1] : null
if (apply && !backupPath) {
  console.error('Refusing to --apply without --backup <file>.')
  process.exit(1)
}

const key = Buffer.from(process.env.PLAID_ENCRYPTION_KEY, 'base64')
if (key.length !== 32) throw new Error('PLAID_ENCRYPTION_KEY must decode to 32 bytes')
const isEncrypted = (v) => /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/.test(v)
function encrypt(plaintext) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), ct.toString('hex')].join(':')
}
function decrypt(stored) {
  const [iv, tag, ct] = stored.split(':')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString('utf8')
}

const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL)

// Same idempotent type changes ensureTable() makes, so ciphertext fits.
await sql`ALTER TABLE receipts ALTER COLUMN amount TYPE TEXT USING amount::TEXT`
await sql`ALTER TABLE activity_log ALTER COLUMN amount TYPE TEXT USING amount::TEXT`
await sql`ALTER TABLE review_queue ALTER COLUMN parsed TYPE TEXT USING parsed::TEXT`

const plan = [] // { table, id, original: {col: value}, updates: {col: ciphertext} }
for (const [table, cols] of Object.entries(TABLES)) {
  const rows = await sql(`SELECT id, ${cols.join(', ')} FROM ${table}`)
  let rowsToChange = 0
  for (const row of rows) {
    const original = {}
    const updates = {}
    for (const col of cols) {
      const value = row[col]
      if (value == null || value === '' || isEncrypted(String(value))) continue
      const ciphertext = encrypt(String(value))
      if (decrypt(ciphertext) !== String(value)) throw new Error(`Round-trip mismatch: ${table}.${col} id=${row.id}`)
      original[col] = String(value)
      updates[col] = ciphertext
    }
    if (Object.keys(updates).length > 0) {
      plan.push({ table, id: row.id, original, updates })
      rowsToChange++
    }
  }
  console.log(`${table}: ${rows.length} rows, ${rowsToChange} need encrypting`)
}

if (!apply) {
  console.log('Dry run. Re-run with --apply --backup <file> to write.')
  process.exit(0)
}

writeFileSync(backupPath, encrypt(JSON.stringify(plan.map(({ table, id, original }) => ({ table, id, original })))))
console.log(`Encrypted backup of original values written to ${backupPath}`)

let done = 0
for (const { table, id, updates } of plan) {
  const cols = Object.keys(updates)
  const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
  await sql(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [id, ...cols.map((c) => updates[c])])
  done++
  if (done % 250 === 0) console.log(`  ${done}/${plan.length}`)
}

// Verify: nothing plaintext left, and every encrypted value decrypts.
for (const [table, cols] of Object.entries(TABLES)) {
  const rows = await sql(`SELECT id, ${cols.join(', ')} FROM ${table}`)
  let plaintext = 0
  for (const row of rows) for (const col of cols) {
    const v = row[col]
    if (v == null || v === '') continue
    if (!isEncrypted(String(v))) plaintext++
    else decrypt(String(v))
  }
  console.log(`verify ${table}: ${plaintext === 0 ? 'all encrypted' : `${plaintext} plaintext values remain`}`)
}

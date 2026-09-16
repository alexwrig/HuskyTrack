import { randomInt, timingSafeEqual } from 'crypto'
import { getDb } from './db'
import { sendLoginCode } from './email'
import { sha256, createSession } from './session'

export { SESSION_COOKIE, ensureAuthTables, validateSession, deleteSession } from './session'

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000            // 10 minutes
const MAX_CODE_ATTEMPTS = 5
const MAX_CODE_REQUESTS_PER_WINDOW = 5
const CODE_REQUEST_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL
  if (!email) throw new Error('OWNER_EMAIL environment variable is not set.')
  return email.trim().toLowerCase()
}

// Avoids leaking hash-comparison timing; irrelevant once rate limiting is in
// place, but cheap to do properly.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0')
}

async function getOrCreateOwnerUser(): Promise<{ id: string; email: string }> {
  const sql = getDb()
  const email = getOwnerEmail()

  const existing = await sql`SELECT id, email FROM users WHERE email = ${email}`
  if (existing[0]) return existing[0] as { id: string; email: string }

  const id = crypto.randomUUID()
  const rows = await sql`INSERT INTO users (id, email) VALUES (${id}, ${email}) RETURNING id, email`
  return rows[0] as { id: string; email: string }
}

export interface RequestCodeResult {
  ok: boolean
  reason?: string
}

export async function requestLoginCode(emailInput: string): Promise<RequestCodeResult> {
  const normalized = emailInput.trim().toLowerCase()
  const ownerEmail = getOwnerEmail()

  // Deliberately vague when the email doesn't match -- a real login system
  // shouldn't confirm or deny which addresses are registered.
  if (normalized !== ownerEmail) {
    return { ok: true }
  }

  const sql = getDb()
  const user = await getOrCreateOwnerUser()

  const windowStart = new Date(Date.now() - CODE_REQUEST_WINDOW_MS).toISOString()
  const recent = await sql`
    SELECT COUNT(*) AS count FROM login_codes
    WHERE user_id = ${user.id} AND created_at > ${windowStart}
  `
  if (Number(recent[0].count) >= MAX_CODE_REQUESTS_PER_WINDOW) {
    return { ok: false, reason: 'Too many code requests. Wait a few minutes and try again.' }
  }

  const code = generateCode()
  const codeHash = await sha256(code)
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  await sql`
    INSERT INTO login_codes (id, user_id, code_hash, expires_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, ${codeHash}, ${expiresAt})
  `

  await sendLoginCode(user.email, code)
  return { ok: true }
}

export interface VerifyCodeResult {
  ok: boolean
  sessionToken?: string
  expiresAt?: string
  reason?: string
}

export async function verifyLoginCode(emailInput: string, codeInput: string): Promise<VerifyCodeResult> {
  const normalized = emailInput.trim().toLowerCase()
  const ownerEmail = getOwnerEmail()
  if (normalized !== ownerEmail) {
    return { ok: false, reason: 'Incorrect code.' }
  }

  const sql = getDb()
  const userRows = await sql`SELECT id, email FROM users WHERE email = ${ownerEmail}`
  const user = userRows[0] as { id: string; email: string } | undefined
  if (!user) return { ok: false, reason: 'Incorrect code.' }

  const rows = await sql`
    SELECT * FROM login_codes
    WHERE user_id = ${user.id} AND consumed_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `
  const record = rows[0] as Record<string, unknown> | undefined
  if (!record) return { ok: false, reason: 'Code expired or not found. Request a new one.' }

  if (Number(record.attempts) >= MAX_CODE_ATTEMPTS) {
    return { ok: false, reason: 'Too many incorrect attempts. Request a new code.' }
  }

  const codeHash = await sha256(codeInput.trim())
  if (!safeEqual(codeHash, record.code_hash as string)) {
    await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ${record.id}`
    return { ok: false, reason: 'Incorrect code.' }
  }

  await sql`UPDATE login_codes SET consumed_at = NOW() WHERE id = ${record.id}`
  await sql`UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ${user.id}`

  const { token, expiresAt } = await createSession(user.id)
  return { ok: true, sessionToken: token, expiresAt }
}

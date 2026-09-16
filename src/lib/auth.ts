import { randomInt, timingSafeEqual } from 'crypto'
import { getDb } from './db'
import { sendLoginCode } from './email'
import { sha256, createSession } from './session'

export { SESSION_COOKIE, ensureAuthTables, validateSession, deleteSession, getSessionUser } from './session'

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000            // 10 minutes
const MAX_CODE_ATTEMPTS = 5
const MAX_CODE_REQUESTS_PER_WINDOW = 5
const CODE_REQUEST_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// The one fixed root admin -- set only via env var (never editable through
// the app itself), so there's always exactly one account that can't be
// locked out or removed by a bug in the guest-management UI.
function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL
  if (!email) throw new Error('ADMIN_EMAIL environment variable is not set.')
  return email.trim().toLowerCase()
}

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === getAdminEmail()
}

// Anyone allowed to sign in is either the admin, or a guest row the admin
// has already added via the admin portal (see app/admin). Guests are
// pre-created with no code sent yet -- role='guest' rows created ahead of
// their first login -- so this is a single existence check.
async function isAllowedEmail(email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true
  const sql = getDb()
  const rows = await sql`SELECT 1 FROM users WHERE email = ${email} AND role = 'guest'`
  return rows.length > 0
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

async function getOrCreateUser(email: string): Promise<{ id: string; email: string }> {
  const sql = getDb()

  const existing = await sql`SELECT id, email FROM users WHERE email = ${email}`
  if (existing[0]) return existing[0] as { id: string; email: string }

  // Guests are normally pre-created by the admin portal before their first
  // login, so this insert path is really just for the admin's own first
  // sign-in ever. Kept generic (role derived from email) so it's correct
  // either way.
  const role = isAdminEmail(email) ? 'admin' : 'guest'
  const id = crypto.randomUUID()
  const rows = await sql`INSERT INTO users (id, email, role) VALUES (${id}, ${email}, ${role}) RETURNING id, email`
  return rows[0] as { id: string; email: string }
}

export interface RequestCodeResult {
  ok: boolean
  reason?: string
}

export async function requestLoginCode(emailInput: string): Promise<RequestCodeResult> {
  const normalized = emailInput.trim().toLowerCase()

  // Deliberately vague when the email doesn't match -- a real login system
  // shouldn't confirm or deny which addresses are registered.
  if (!await isAllowedEmail(normalized)) {
    return { ok: true }
  }

  const sql = getDb()
  const user = await getOrCreateUser(normalized)

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
  if (!await isAllowedEmail(normalized)) {
    return { ok: false, reason: 'Incorrect code.' }
  }

  const sql = getDb()
  const userRows = await sql`SELECT id, email FROM users WHERE email = ${normalized}`
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

// ── Guest management (admin only -- callers must check isAdminEmail first) ────

export interface GuestUser {
  id: string
  email: string
  email_verified_at: string | null
  created_at: string
}

function rowToGuest(r: Record<string, unknown>): GuestUser {
  return {
    id: r.id as string,
    email: r.email as string,
    email_verified_at: r.email_verified_at ? new Date(r.email_verified_at as string).toISOString() : null,
    created_at: new Date(r.created_at as string).toISOString(),
  }
}

export async function listGuests(): Promise<GuestUser[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT id, email, email_verified_at, created_at FROM users
    WHERE role = 'guest' ORDER BY created_at DESC
  `
  return rows.map((r) => rowToGuest(r as Record<string, unknown>))
}

export async function addGuest(emailInput: string): Promise<GuestUser> {
  const email = emailInput.trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address.')
  if (isAdminEmail(email)) throw new Error('That address is already the admin account.')

  const sql = getDb()
  const existing = await sql`SELECT id, email, role, email_verified_at, created_at FROM users WHERE email = ${email}`
  if (existing[0]) {
    if ((existing[0].role as string) !== 'guest') throw new Error('That email is already registered.')
    return rowToGuest(existing[0] as Record<string, unknown>)
  }

  const id = crypto.randomUUID()
  const rows = await sql`
    INSERT INTO users (id, email, role) VALUES (${id}, ${email}, 'guest')
    RETURNING id, email, email_verified_at, created_at
  `
  return rowToGuest(rows[0] as Record<string, unknown>)
}

// Deleting the row cascades to sessions/login_codes (ON DELETE CASCADE), so
// this revokes any active session immediately, not just future sign-ins.
// Scoped to role='guest' so this can never delete the admin account, even
// if a bug or bad input passed the admin's own id in.
export async function removeGuest(id: string): Promise<boolean> {
  const sql = getDb()
  const rows = await sql`DELETE FROM users WHERE id = ${id} AND role = 'guest' RETURNING id`
  return rows.length > 0
}

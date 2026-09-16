// Session/schema primitives only -- no email sending, and no Node-only
// APIs. Kept separate from auth.ts so middleware (which runs on Next.js's
// Edge runtime) never pulls in anything edge-incompatible: neither the
// AgentMail SDK nor Node's 'crypto' module (Node's crypto throws at
// runtime on Edge even though it can pass the build -- Web Crypto, used
// here throughout, is the edge-safe equivalent).

import { getDb } from './db'

export const SESSION_COOKIE = 'ht_session'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function ensureAuthTables(): Promise<void> {
  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id                TEXT PRIMARY KEY,
      email             TEXT NOT NULL UNIQUE,
      email_verified_at TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'guest'`

  // The one true admin is always whoever ADMIN_EMAIL currently points at --
  // re-asserted on every call so the role can never drift from the env var
  // even if a database row was tampered with. Reading process.env directly
  // here (rather than importing from auth.ts) keeps this file free of
  // anything edge-incompatible.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (adminEmail) {
    await sql`UPDATE users SET role = 'admin' WHERE email = ${adminEmail} AND role <> 'admin'`
  }

  await sql`
    CREATE TABLE IF NOT EXISTS login_codes (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash   TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      attempts    INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_login_codes_user ON login_codes (user_id, created_at DESC)`

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      token_hash    TEXT NOT NULL UNIQUE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at    TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash)`
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const sql = getDb()
  // The raw token goes in the cookie; only its hash is ever stored, so a
  // database compromise alone can't be replayed as a valid session.
  const token = randomToken(32)
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await sql`
    INSERT INTO sessions (id, token_hash, user_id, expires_at)
    VALUES (${crypto.randomUUID()}, ${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `

  return { token, expiresAt: expiresAt.toISOString() }
}

// Validates the session and bumps last_seen_at in one round trip. Checking
// against the database (not a signed/stateless token) means revoking a
// session -- e.g. signing out -- takes effect immediately everywhere.
export async function validateSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const sql = getDb()
  const tokenHash = await sha256(token)
  const rows = await sql`
    UPDATE sessions SET last_seen_at = NOW()
    WHERE token_hash = ${tokenHash} AND expires_at > NOW()
    RETURNING id
  `
  return rows.length > 0
}

// Like validateSession, but also returns who the session belongs to (and
// their role) in the same round trip -- used by middleware to gate
// /admin and /api/admin/* without a second query.
export async function getSessionUser(token: string | undefined): Promise<{ id: string; email: string; role: string } | null> {
  if (!token) return null
  const sql = getDb()
  const tokenHash = await sha256(token)
  const rows = await sql`
    UPDATE sessions SET last_seen_at = NOW()
    WHERE token_hash = ${tokenHash} AND expires_at > NOW()
    RETURNING user_id
  `
  if (!rows[0]) return null

  const userRows = await sql`SELECT id, email, role FROM users WHERE id = ${rows[0].user_id}`
  const user = userRows[0] as { id: string; email: string; role: string } | undefined
  return user ?? null
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return
  const sql = getDb()
  const tokenHash = await sha256(token)
  await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`
}

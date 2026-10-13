import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  // Named for its original use; it now encrypts all stored spending data.
  const key = process.env.PLAID_ENCRYPTION_KEY
  if (!key) throw new Error('PLAID_ENCRYPTION_KEY environment variable is not set.')
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) throw new Error('PLAID_ENCRYPTION_KEY must decode to exactly 32 bytes (base64).')
  return buf
}

// Stored as iv:authTag:ciphertext, each hex-encoded.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':')
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()])
  return plaintext.toString('utf8')
}

const CIPHERTEXT_PATTERN = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/

// True for values produced by encrypt() above.
export function isEncrypted(value: string): boolean {
  return CIPHERTEXT_PATTERN.test(value)
}

export function encryptNullable(value: string | number | null | undefined): string | null {
  return value == null || value === '' ? null : encrypt(String(value))
}

// Reads a column that may still hold legacy plaintext from before it was
// encrypted (rows are migrated by scripts/encrypt-existing-data.mjs).
// Non-string values (e.g. a FLOAT not yet converted) pass through as text.
export function decryptMaybe(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  return isEncrypted(s) ? decrypt(s) : s
}

import crypto from 'crypto'

// ---------------------------------------------------------------------------
// Symmetric encryption for sensitive data at rest.
//
// SECURITY (CWE-327/-329/-311/-312):
//   - AES-256-GCM (authenticated) for all NEW ciphertext — provides integrity
//     and tamper detection, replacing the unauthenticated AES-256-CBC.
//   - Per-ciphertext random salt + scrypt KDF (was a single unsalted SHA-256).
//   - Fail CLOSED: `ENCRYPTION_KEY` is required (except in the Jest test env),
//     a known-weak key is rejected in production, and a cipher error THROWS
//     rather than silently returning plaintext/ciphertext (the old
//     `catch { return text }` stored/served secrets in the clear on any failure).
//   - Backward compatible: legacy AES-256-CBC values ("<iv>:<cipher>") still
//     decrypt (same sha256 key), so existing rows keep working and get upgraded
//     to GCM on the next write.
//
//   New format:    v2:<saltHex>:<ivHex>:<tagHex>:<cipherHex>   (AES-256-GCM)
//   Legacy format: <ivHex(32)>:<cipherHex>                     (AES-256-CBC, read-only)
//
// The server also fails fast at boot if ENCRYPTION_KEY is unset (config/env.ts),
// so the guards below are defense-in-depth.
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY

// Fail fast: no public fallback. A silent default would mean every self-hosted
// install that forgets to set ENCRYPTION_KEY shares the exact same key,
// defeating at-rest encryption entirely. The only exemption is the Jest test
// environment (NODE_ENV === 'test'), which needs a deterministic key.
if (!ENCRYPTION_KEY_RAW && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'ENCRYPTION_KEY environment variable is required. Generate one with ' +
    '`openssl rand -hex 32` and set it before starting the server — secrets at ' +
    'rest (credentials, IdP client secrets, connectivity provider configs, 2FA ' +
    'secrets, email/SMTP passwords) cannot be protected without it.'
  )
}

// Reject known-weak / default keys in production (defense in depth).
const WEAK_KEYS = new Set([
  'default-encryption-key-change-in-production',
  'dev-only-encryption-key-not-for-production',
  'changeme',
  'change-me',
  'secret',
  'password',
])
if (
  process.env.NODE_ENV === 'production' &&
  ENCRYPTION_KEY_RAW &&
  (WEAK_KEYS.has(ENCRYPTION_KEY_RAW) || ENCRYPTION_KEY_RAW.length < 16)
) {
  throw new Error(
    'ENCRYPTION_KEY is weak or a known default; set a strong random secret ' +
    '(e.g. `openssl rand -hex 32`) in production.'
  )
}

const RESOLVED_KEY = ENCRYPTION_KEY_RAW || 'test-only-encryption-key-never-used-outside-jest'

const GCM_ALGORITHM = 'aes-256-gcm'
const V2_PREFIX = 'v2'

// Legacy CBC key (single unsalted SHA-256) — retained ONLY to decrypt data
// written before the GCM migration. Never used to produce new ciphertext.
const LEGACY_ALGORITHM = 'aes-256-cbc'
const LEGACY_CBC_KEY = crypto.createHash('sha256').update(RESOLVED_KEY).digest()

/** Derive a 256-bit key from the master secret + a per-ciphertext salt (scrypt). */
function deriveKey(salt: Buffer): Buffer {
  return crypto.scryptSync(RESOLVED_KEY, salt, 32)
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns `v2:<saltHex>:<ivHex>:<tagHex>:<cipherHex>`. Empty input → "".
 * Throws on any cipher failure (never returns plaintext).
 */
export function encrypt(text: string): string {
  if (!text) return ''

  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12) // 96-bit nonce (GCM standard)
  const key = deriveKey(salt)
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    V2_PREFIX,
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * Decrypt a value produced by `encrypt` (new v2/GCM) or by the legacy CBC
 * scheme. Values with no ':' are returned unchanged (treated as plaintext).
 * Throws on authentication/decryption failure (tamper or wrong key) — callers
 * gate with `isEncrypted` so genuine plaintext never reaches here.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText

  // New authenticated format.
  if (encryptedText.startsWith(`${V2_PREFIX}:`)) {
    const [, saltHex, ivHex, tagHex, cipherHex] = encryptedText.split(':')
    const key = deriveKey(Buffer.from(saltHex, 'hex'))
    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(), // throws if the auth tag does not verify
    ])
    return decrypted.toString('utf8')
  }

  // Legacy AES-256-CBC (read-only path for pre-migration rows).
  const [ivHex, encryptedHex] = encryptedText.split(':')
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, LEGACY_CBC_KEY, Buffer.from(ivHex, 'hex'))
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Whether a value looks like ciphertext produced by this utility — either the
 * new `v2:...` GCM format or the legacy `<32-hex iv>:<hex cipher>` CBC format.
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false

  if (value.startsWith(`${V2_PREFIX}:`)) {
    const parts = value.split(':')
    // v2 : salt : iv : tag : cipher
    return parts.length === 5 && parts.slice(1).every((p) => /^[0-9a-f]+$/i.test(p))
  }

  if (!value.includes(':')) return false
  const [ivHex, cipherHex] = value.split(':')
  return (
    ivHex.length === 32 &&
    /^[0-9a-f]+$/i.test(ivHex) &&
    !!cipherHex &&
    /^[0-9a-f]+$/i.test(cipherHex)
  )
}

/**
 * Encrypt specific fields of an object and return a new object.
 * Fields not in `sensitiveFields` (or already encrypted) are left untouched.
 */
export function encryptFields(
  obj: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result = { ...obj }

  for (const field of sensitiveFields) {
    const val = result[field]
    if (typeof val === 'string' && val.length > 0 && !isEncrypted(val)) {
      result[field] = encrypt(val)
    }
  }

  return result
}

/**
 * Decrypt specific fields of an object and return a new object.
 * Fields not in `sensitiveFields` (or not encrypted) are left untouched.
 */
export function decryptFields(
  obj: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result = { ...obj }

  for (const field of sensitiveFields) {
    const val = result[field]
    if (typeof val === 'string' && val.length > 0 && isEncrypted(val)) {
      result[field] = decrypt(val)
    }
  }

  return result
}

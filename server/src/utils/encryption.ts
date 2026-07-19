import crypto from 'crypto'
import { loggerService } from '../module/logger/logger.service'

// ---------------------------------------------------------------------------
// AES-256-CBC encryption utility
//
// Reusable encrypt/decrypt for sensitive data at rest.
// Encrypted format: "<iv_hex>:<ciphertext_hex>"
//
// SECURITY: fail-fast, no public fallback. A silent "dev" default here would
// mean every self-hosted install that forgets to set ENCRYPTION_KEY shares
// the exact same key, defeating at-rest encryption entirely — this is why
// the previous default only guarded `NODE_ENV === 'production'`, which most
// self-hosted deployments never explicitly set. The only exemption is the
// Jest test environment (NODE_ENV === 'test'), which never represents a real
// deployment and needs a deterministic key to keep unit tests hermetic.
// ---------------------------------------------------------------------------

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY

if (!ENCRYPTION_KEY_RAW && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'ENCRYPTION_KEY environment variable is required. Generate one with ' +
    '`openssl rand -hex 32` and set it before starting the server — ' +
    'secrets at rest (credentials, IdP client secrets, connectivity provider ' +
    'configs, 2FA secrets) cannot be protected without it.'
  )
}

const RESOLVED_KEY = ENCRYPTION_KEY_RAW || 'test-only-encryption-key-never-used-outside-jest'
const ENCRYPTION_KEY = crypto.createHash('sha256').update(RESOLVED_KEY).digest()
const ALGORITHM = 'aes-256-cbc'

/**
 * Encrypt a plaintext string.
 * Returns the format `<iv_hex>:<ciphertext_hex>`.
 */
export function encrypt(text: string): string {
  if (!text) return ''

  try {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `${iv.toString('hex')}:${encrypted}`
  } catch (error) {
    loggerService.error('Encryption error:', error)
    return text
  }
}

/**
 * Decrypt a previously encrypted string.
 * Expects the format `<iv_hex>:<ciphertext_hex>`.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText

  try {
    const [ivHex, encryptedHex] = encryptedText.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv)
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    loggerService.error('Decryption error:', error)
    return encryptedText
  }
}

/**
 * Check whether a value looks like it was encrypted by this utility.
 * Checks for the `<32-hex-chars>:<hex-chars>` pattern.
 */
export function isEncrypted(value: string): boolean {
  if (!value || !value.includes(':')) return false
  const [ivHex, cipherHex] = value.split(':')
  return ivHex.length === 32 && /^[0-9a-f]+$/.test(ivHex) && /^[0-9a-f]+$/.test(cipherHex)
}

/**
 * Encrypt specific fields of an object in-place and return a new object.
 * Fields not in `sensitiveFields` are left untouched.
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
 * Fields not in `sensitiveFields` are left untouched.
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

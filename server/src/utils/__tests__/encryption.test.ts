import crypto from 'crypto'
import { encrypt, decrypt, isEncrypted, encryptFields, decryptFields } from '../encryption'

// Reproduce the legacy AES-256-CBC scheme (key = sha256(key), 16-byte IV) to
// prove backward-compatible reads. jest.setup.ts sets ENCRYPTION_KEY for tests,
// so the util's RESOLVED_KEY is exactly this value.
const TEST_KEY = 'test-only-encryption-key-do-not-use-outside-tests'
function legacyCbcEncrypt(text: string): string {
  const key = crypto.createHash('sha256').update(TEST_KEY).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let enc = cipher.update(text, 'utf8', 'hex')
  enc += cipher.final('hex')
  return `${iv.toString('hex')}:${enc}`
}

describe('encryption utility', () => {
  describe('encrypt / decrypt', () => {
    it('round-trips a simple string', () => {
      const plain = 'my-secret-api-key-12345'
      const cipher = encrypt(plain)
      expect(cipher).not.toBe(plain)
      expect(decrypt(cipher)).toBe(plain)
    })

    it('round-trips unicode and special characters', () => {
      const plain = 'pässwörd!@#$%^&*()\n\ttabs'
      expect(decrypt(encrypt(plain))).toBe(plain)
    })

    it('returns empty string when encrypting empty input', () => {
      expect(encrypt('')).toBe('')
    })

    it('returns input unchanged when decrypting non-encrypted string', () => {
      expect(decrypt('plain-text')).toBe('plain-text')
    })

    it('produces different ciphertexts for same input (random IV/salt)', () => {
      const plain = 'deterministic-test'
      const a = encrypt(plain)
      const b = encrypt(plain)
      expect(a).not.toBe(b)
      expect(decrypt(a)).toBe(plain)
      expect(decrypt(b)).toBe(plain)
    })
  })

  describe('isEncrypted', () => {
    it('returns true for encrypted output', () => {
      expect(isEncrypted(encrypt('test'))).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(isEncrypted('just-a-string')).toBe(false)
      expect(isEncrypted('')).toBe(false)
    })

    it('returns false for masked values', () => {
      expect(isEncrypted('••••••abcd')).toBe(false)
    })
  })

  describe('encryptFields / decryptFields', () => {
    it('encrypts only the specified fields', () => {
      const obj = { apiKey: 'secret123', tailnet: 'mynet', apiUrl: 'https://api.example.com' }
      const encrypted = encryptFields(obj, ['apiKey'])

      expect(encrypted.apiKey).not.toBe('secret123')
      expect(isEncrypted(encrypted.apiKey as string)).toBe(true)
      expect(encrypted.tailnet).toBe('mynet')
      expect(encrypted.apiUrl).toBe('https://api.example.com')
    })

    it('round-trips with decryptFields', () => {
      const obj = { apiKey: 'secret123', privateKey: 'key-data', host: 'example.com' }
      const fields = ['apiKey', 'privateKey']
      const decrypted = decryptFields(encryptFields(obj, fields), fields)

      expect(decrypted.apiKey).toBe('secret123')
      expect(decrypted.privateKey).toBe('key-data')
      expect(decrypted.host).toBe('example.com')
    })

    it('does not double-encrypt already-encrypted fields', () => {
      const first = encryptFields({ apiKey: 'secret' }, ['apiKey'])
      const second = encryptFields(first, ['apiKey'])
      expect(decrypt(second.apiKey as string)).toBe('secret')
    })

    it('skips fields not present in the object', () => {
      expect(encryptFields({ host: 'example.com' }, ['apiKey', 'secret'])).toEqual({ host: 'example.com' })
    })

    it('skips empty string fields', () => {
      expect(encryptFields({ apiKey: '', host: 'example.com' }, ['apiKey']).apiKey).toBe('')
    })
  })

  describe('hardening (AES-256-GCM + legacy CBC read)', () => {
    it('produces the authenticated v2 GCM format', () => {
      const cipher = encrypt('super-secret')
      expect(cipher.startsWith('v2:')).toBe(true)
      expect(cipher.split(':')).toHaveLength(5) // v2:salt:iv:tag:cipher
    })

    it('decrypts legacy AES-256-CBC ciphertext (backward compatible)', () => {
      const legacy = legacyCbcEncrypt('legacy-secret')
      expect(isEncrypted(legacy)).toBe(true)
      expect(decrypt(legacy)).toBe('legacy-secret')
    })

    it('throws on a tampered GCM ciphertext (auth-tag integrity, fail closed)', () => {
      const parts = encrypt('tamper-me').split(':')
      const c = parts[4]
      parts[4] = (c[0] === '0' ? '1' : '0') + c.slice(1) // flip a byte in the ciphertext
      expect(() => decrypt(parts.join(':'))).toThrow()
    })

    it('round-trips a colon-containing secret', () => {
      const secret = 'user:pa:ss:word'
      expect(decrypt(encrypt(secret))).toBe(secret)
    })
  })
})

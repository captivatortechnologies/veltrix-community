import { encrypt, decrypt, isEncrypted, encryptFields, decryptFields } from '../encryption'

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

    it('produces different ciphertexts for same input (random IV)', () => {
      const plain = 'deterministic-test'
      const a = encrypt(plain)
      const b = encrypt(plain)
      expect(a).not.toBe(b) // different IVs
      expect(decrypt(a)).toBe(plain)
      expect(decrypt(b)).toBe(plain)
    })
  })

  describe('isEncrypted', () => {
    it('returns true for encrypted output', () => {
      const cipher = encrypt('test')
      expect(isEncrypted(cipher)).toBe(true)
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
      const sensitiveFields = ['apiKey']

      const encrypted = encryptFields(obj, sensitiveFields)

      // apiKey should be encrypted
      expect(encrypted.apiKey).not.toBe('secret123')
      expect(isEncrypted(encrypted.apiKey as string)).toBe(true)

      // non-sensitive fields should be unchanged
      expect(encrypted.tailnet).toBe('mynet')
      expect(encrypted.apiUrl).toBe('https://api.example.com')
    })

    it('round-trips with decryptFields', () => {
      const obj = { apiKey: 'secret123', privateKey: 'key-data', host: 'example.com' }
      const sensitiveFields = ['apiKey', 'privateKey']

      const encrypted = encryptFields(obj, sensitiveFields)
      const decrypted = decryptFields(encrypted, sensitiveFields)

      expect(decrypted.apiKey).toBe('secret123')
      expect(decrypted.privateKey).toBe('key-data')
      expect(decrypted.host).toBe('example.com')
    })

    it('does not double-encrypt already-encrypted fields', () => {
      const obj = { apiKey: 'secret' }
      const sensitiveFields = ['apiKey']

      const first = encryptFields(obj, sensitiveFields)
      const second = encryptFields(first, sensitiveFields)

      // Should not wrap encrypted value in another layer
      expect(decrypt(second.apiKey as string)).toBe('secret')
    })

    it('skips fields that are not present in the object', () => {
      const obj = { host: 'example.com' }
      const encrypted = encryptFields(obj, ['apiKey', 'secret'])
      expect(encrypted).toEqual({ host: 'example.com' })
    })

    it('skips empty string fields', () => {
      const obj = { apiKey: '', host: 'example.com' }
      const encrypted = encryptFields(obj, ['apiKey'])
      expect(encrypted.apiKey).toBe('')
    })
  })
})

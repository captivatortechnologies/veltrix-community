// Mock the Prisma client so importing the service is side-effect-free — the
// crypto helpers under test never touch the database.
jest.mock('../../../db', () => ({ __esModule: true, default: {} }));

import { encryptSecret, decryptSecret, decryptCredentialSecrets, redactCredential } from '../credential.service';
import { isEncrypted } from '../../../utils/encryption';
import type { CredentialResponseType } from '../credential.schema';

describe('credential secret crypto — always encrypt at rest', () => {
  describe('encryptSecret', () => {
    it('encrypts a secret regardless of credential type (fixes plaintext-at-rest)', () => {
      // The old code only encrypted an apiToken when type was 'API_KEY'/'TOKEN',
      // storing it in plaintext otherwise. encryptSecret has no type gate.
      const plaintext = 'super-secret-hec-token';
      const encrypted = encryptSecret(plaintext) as string;

      expect(encrypted).not.toBe(plaintext);
      expect(isEncrypted(encrypted)).toBe(true);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('is idempotent — an already-encrypted value is not re-encrypted', () => {
      const once = encryptSecret('token') as string;
      const twice = encryptSecret(once) as string;

      expect(twice).toBe(once);
      expect(decryptSecret(twice)).toBe('token');
    });

    it('passes through empty / null / undefined', () => {
      expect(encryptSecret('')).toBe('');
      expect(encryptSecret(null)).toBeNull();
      expect(encryptSecret(undefined)).toBeUndefined();
    });
  });

  describe('decryptSecret', () => {
    it('round-trips an encrypted secret', () => {
      const enc = encryptSecret('p@ss:word') as string;
      expect(decryptSecret(enc)).toBe('p@ss:word');
    });

    it('leaves legacy plaintext untouched (backward compatible)', () => {
      expect(decryptSecret('legacy-plaintext-token')).toBe('legacy-plaintext-token');
    });

    it('passes through empty / null / undefined', () => {
      expect(decryptSecret('')).toBe('');
      expect(decryptSecret(null)).toBeNull();
      expect(decryptSecret(undefined)).toBeUndefined();
    });
  });

  describe('decryptCredentialSecrets', () => {
    it('decrypts password/apiToken/certificate and preserves other fields', () => {
      const raw = {
        id: 'c1',
        name: 'idx1',
        username: 'svc',
        password: encryptSecret('pw') as string,
        apiToken: encryptSecret('tok') as string,
        certificate: encryptSecret('cert') as string,
        type: 'TOKEN',
        toolId: 't1',
      };

      const out = decryptCredentialSecrets(raw);

      expect(out).toMatchObject({
        id: 'c1',
        name: 'idx1',
        username: 'svc',
        type: 'TOKEN',
        toolId: 't1',
        password: 'pw',
        apiToken: 'tok',
        certificate: 'cert',
      });
    });

    it('handles null secrets and legacy plaintext values', () => {
      const raw = { id: 'c2', password: null, apiToken: 'plain-token', certificate: undefined };
      const out = decryptCredentialSecrets(raw);

      expect(out.password).toBeNull();
      expect(out.apiToken).toBe('plain-token');
      expect(out.certificate).toBeUndefined();
    });
  });

  describe('redactCredential (never send secrets over the API)', () => {
    const base: CredentialResponseType = {
      id: 'c1',
      name: 'idx1',
      username: 'svc',
      password: 'the-password',
      apiToken: 'the-token',
      certificate: 'the-cert',
      type: 'TOKEN',
      endpoint: 'https://api.example.com',
      toolId: 't1',
      createdAt: new Date('2026-07-10T00:00:00Z'),
      updatedAt: new Date('2026-07-10T00:00:00Z'),
      tags: [{ id: 'tag1', name: 'prod' }],
    };

    it('removes every secret field from the output', () => {
      const out = redactCredential(base);
      const keys = Object.keys(out);

      expect(keys).not.toContain('password');
      expect(keys).not.toContain('apiToken');
      expect(keys).not.toContain('certificate');
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('the-password');
      expect(serialized).not.toContain('the-token');
      expect(serialized).not.toContain('the-cert');
    });

    it('surfaces only whether each secret is set via has* flags, and keeps the endpoint (not a secret)', () => {
      expect(redactCredential(base)).toMatchObject({
        id: 'c1',
        name: 'idx1',
        username: 'svc',
        type: 'TOKEN',
        endpoint: 'https://api.example.com',
        toolId: 't1',
        hasPassword: true,
        hasApiToken: true,
        hasCertificate: true,
        tags: [{ id: 'tag1', name: 'prod' }],
      });
    });

    it('reports has* = false for empty / null secrets', () => {
      const out = redactCredential({ ...base, password: '', apiToken: null, certificate: null });
      expect(out).toMatchObject({ hasPassword: false, hasApiToken: false, hasCertificate: false });
    });
  });
});

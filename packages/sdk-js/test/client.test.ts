import { describe, it, expect, afterEach } from 'vitest';
import { VeltrixClient, DEFAULT_BASE_URL, VeltrixError, NotFoundError } from '../src/index';

describe('VeltrixClient', () => {
  const originalEnv = process.env.VELTRIX_API_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VELTRIX_API_URL;
    } else {
      process.env.VELTRIX_API_URL = originalEnv;
    }
  });

  it('defaults to the localhost base URL', () => {
    delete process.env.VELTRIX_API_URL;
    const client = new VeltrixClient();
    expect(client.getBaseUrl()).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe('http://localhost:5000/api');
  });

  it('honours an explicit baseURL and strips a trailing slash', () => {
    const client = new VeltrixClient({ baseURL: 'https://veltrix.internal/api/' });
    expect(client.getBaseUrl()).toBe('https://veltrix.internal/api');
  });

  it('falls back to the VELTRIX_API_URL env var when baseURL is omitted', () => {
    process.env.VELTRIX_API_URL = 'http://example.test:8080/api';
    const client = new VeltrixClient();
    expect(client.getBaseUrl()).toBe('http://example.test:8080/api');
  });

  it('prefers an explicit baseURL over the env var', () => {
    process.env.VELTRIX_API_URL = 'http://env.test/api';
    const client = new VeltrixClient({ baseURL: 'http://explicit.test/api' });
    expect(client.getBaseUrl()).toBe('http://explicit.test/api');
  });

  it('exposes the expected OSS resource handlers', () => {
    const client = new VeltrixClient();
    for (const name of [
      'auth',
      'profile',
      'organization',
      'users',
      'roles',
      'apiKeys',
      'tools',
      'components',
      'credentials',
      'tags',
      'connectivity',
      'tailscale',
      'tailscaleConfig',
      'logForwarding',
      'logEntries',
      'webhooks',
      'cognito',
    ] as const) {
      expect(client[name], `resource ${name} should be defined`).toBeDefined();
    }
  });

  it('does not expose dropped commercial resource handlers', () => {
    const client = new VeltrixClient() as unknown as Record<string, unknown>;
    for (const name of ['payment', 'paymentMethods', 'byol', 'byolComponent', 'customers']) {
      expect(client[name], `resource ${name} should not exist`).toBeUndefined();
    }
  });

  it('error classes extend VeltrixError', () => {
    const err = new NotFoundError('missing', { httpStatus: 404 });
    expect(err).toBeInstanceOf(VeltrixError);
    expect(err.httpStatus).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });
});

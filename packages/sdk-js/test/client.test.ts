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
      'me',
      'profile',
      'organization',
      'users',
      'roles',
      'apiKeys',
      'tools',
      'customerTools',
      'components',
      'credentials',
      'tags',
      'environments',
      'connectivity',
      'connectivityProviders',
      'tailscale',
      'tailscaleConfig',
      'logForwarding',
      'logEntries',
      'reports',
      'configurationCanvas',
      'configurationHistory',
      'pipeline',
      'apps',
      'sandboxes',
      'webhooks',
      'brand',
      'featureFlags',
      'cognito',
    ] as const) {
      expect(client[name], `resource ${name} should be defined`).toBeDefined();
    }
  });

  it('does not expose dropped commercial resource handlers', () => {
    const client = new VeltrixClient() as unknown as Record<string, unknown>;
    for (const name of [
      'payment',
      'paymentMethods',
      'subscription',
      'byol',
      'byolComponent',
      'cloudProviders',
      'mssp',
      'platformAdmin',
      'groupAdmin',
      'network',
      'customers',
    ]) {
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

describe('refined resource routes', () => {
  // Records the (method, url) each resource method resolves to, without any
  // network. Stubs the httpClient the resource holds; direct-verb helpers get
  // (path, [data], config) while `_action` goes through request({ method, url }).
  function stubClient() {
    const calls: Array<{ method: string; url: string; data?: unknown; params?: unknown }> = [];
    const verb = (method: string, hasData: boolean) => (path: string, a?: any, b?: any) => {
      const config = hasData ? b : a;
      calls.push({ method, url: path, data: hasData ? a : undefined, params: config?.params });
      return Promise.resolve({});
    };
    const stub = {
      get: verb('GET', false),
      delete: verb('DELETE', false),
      post: verb('POST', true),
      put: verb('PUT', true),
      patch: verb('PATCH', true),
      request: (cfg: any) => {
        calls.push({ method: cfg.method, url: cfg.url, data: cfg.data, params: cfg.params });
        return Promise.resolve({});
      },
    };
    const client = new VeltrixClient() as any;
    for (const r of [
      'pipeline',
      'configurationCanvas',
      'configurationHistory',
      'reports',
      'environments',
      'apps',
      'sandboxes',
    ]) {
      client[r].httpClient = stub;
    }
    return { client, calls };
  }

  it('pipeline maps to canvas/deployment/drift routes', async () => {
    const { client, calls } = stubClient();
    await client.pipeline.validateCanvas('C');
    await client.pipeline.deployCanvas('C', { environmentId: 'E' });
    await client.pipeline.getDeployment('D');
    await client.pipeline.rollbackDeployment('D', { reason: 'x' });
    await client.pipeline.resolveDrift('DR', { action: 'ignore' });
    expect(calls).toEqual([
      { method: 'POST', url: 'pipeline/canvas/C/validate', data: undefined, params: undefined },
      { method: 'POST', url: 'pipeline/canvas/C/deploy', data: { environmentId: 'E' }, params: undefined },
      { method: 'GET', url: 'pipeline/deployments/D', data: undefined, params: undefined },
      { method: 'POST', url: 'pipeline/deployments/D/rollback', data: { reason: 'x' }, params: undefined },
      { method: 'POST', url: 'pipeline/drift/DR/resolve', data: { action: 'ignore' }, params: undefined },
    ]);
  });

  it('configurationCanvas maps status / versions / comments routes', async () => {
    const { client, calls } = stubClient();
    await client.configurationCanvas.updateStatus('C', { status: 'APPROVED' });
    await client.configurationCanvas.getVersion('C', 'H');
    await client.configurationCanvas.addComment('C', { body: 'hi' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PATCH configuration-canvas/C/status',
      'GET configuration-canvas/C/versions/H',
      'POST configuration-canvas/C/comments',
    ]);
  });

  it('configurationHistory maps approve/reject/revert routes', async () => {
    const { client, calls } = stubClient();
    await client.configurationHistory.approve('X');
    await client.configurationHistory.reject('Y', { reason: 'no' });
    await client.configurationHistory.revert('V1');
    expect(calls).toEqual([
      { method: 'POST', url: 'configuration-history/approve/X', data: undefined, params: undefined },
      { method: 'POST', url: 'configuration-history/reject/Y', data: { reason: 'no' }, params: undefined },
      { method: 'POST', url: 'configuration-history/revert', data: { versionId: 'V1' }, params: undefined },
    ]);
  });

  it('reports maps to the five named report routes', async () => {
    const { client, calls } = stubClient();
    await client.reports.getAuditLogs();
    await client.reports.getUserActivity();
    await client.reports.getResourceUsage();
    await client.reports.getSecurityOverview();
    await client.reports.getCompliance();
    expect(calls.map((c) => c.url)).toEqual([
      'reports/audit-logs',
      'reports/user-activity',
      'reports/resource-usage',
      'reports/security-overview',
      'reports/compliance',
    ]);
  });

  it('environments has no single GET and maps policy routes', async () => {
    const { client, calls } = stubClient();
    expect((client.environments as any).get).toBeUndefined();
    await client.environments.getPolicy('ENV');
    await client.environments.updatePolicy('ENV', { requireApproval: true });
    expect(calls).toEqual([
      { method: 'GET', url: 'environments/ENV/policy', data: undefined, params: undefined },
      { method: 'PUT', url: 'environments/ENV/policy', data: { requireApproval: true }, params: undefined },
    ]);
  });

  it('apps maps enable / install-from-url / config-template / operation routes', async () => {
    const { client, calls } = stubClient();
    await client.apps.enable('slug');
    await client.apps.installFromUrl('http://x/y.zip');
    await client.apps.getConfigTemplate('slug', 'ct');
    await client.apps.runOperation('slug', 'op', { params: {} });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST apps/slug/enable',
      'POST apps/install-from-url',
      'GET apps/slug/config-types/ct/canvas',
      'POST apps/slug/operations/op',
    ]);
  });

  it('sandboxes maps file (query path) and run routes', async () => {
    const { client, calls } = stubClient();
    await client.sandboxes.getFile('SB', 'a/b.ts');
    await client.sandboxes.run('SB', { configTypeId: 'ct', handler: 'validate' });
    expect(calls).toEqual([
      { method: 'GET', url: 'sandboxes/SB/file', data: undefined, params: { path: 'a/b.ts' } },
      { method: 'POST', url: 'sandboxes/SB/run', data: { configTypeId: 'ct', handler: 'validate' }, params: undefined },
    ]);
  });
});

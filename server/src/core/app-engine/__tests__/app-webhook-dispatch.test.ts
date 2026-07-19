/**
 * AppRegistry.dispatchWebhook — inbound webhook → app onWebhook dispatch.
 *
 * Verifies the platform hands a webhook to each app that declares an onWebhook
 * hook, with the right context, and that a failing app handler never breaks
 * ingest.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppRegistry } from '../app-registry';

function makeApp(registry: AppRegistry, id: string, hookBody: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `app-${id}-`));
  fs.writeFileSync(path.join(dir, 'onWebhook.js'), hookBody);
  (registry as any).loadedApps.set(id, {
    manifest: { id, hooks: { onWebhook: 'onWebhook.js' } },
    dir,
    pipelineHandlers: new Map(),
    serverModule: {},
  });
  return dir;
}

describe('AppRegistry.dispatchWebhook', () => {
  const db = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() };

  it('invokes each app onWebhook with the webhook context', async () => {
    const registry = new AppRegistry(db as any, '/fake/apps');
    const out = path.join(os.tmpdir(), `wh-${Date.now()}.json`);
    process.env.WH_OUT = out;
    makeApp(
      registry,
      'splunk-enterprise',
      `module.exports = async (ctx) => require('fs').writeFileSync(process.env.WH_OUT, JSON.stringify({ appId: ctx.appId, source: ctx.source, event: ctx.event, hasDb: !!ctx.db, payload: ctx.payload }));`,
    );

    await registry.dispatchWebhook({
      source: 'github',
      event: 'deployment',
      payload: { infrastructureId: 'infra-1', status: 'success' },
    });

    const captured = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(captured.appId).toBe('splunk-enterprise');
    expect(captured.source).toBe('github');
    expect(captured.event).toBe('deployment');
    expect(captured.hasDb).toBe(true);
    expect(captured.payload.infrastructureId).toBe('infra-1');
  });

  it('does not reject when an app handler throws', async () => {
    const registry = new AppRegistry(db as any, '/fake/apps');
    makeApp(registry, 'broken-app', `module.exports = async () => { throw new Error('boom'); };`);

    await expect(
      registry.dispatchWebhook({ source: 'x', event: 'y', payload: {} }),
    ).resolves.toBeUndefined();
  });

  it('ignores apps without an onWebhook hook', async () => {
    const registry = new AppRegistry(db as any, '/fake/apps');
    (registry as any).loadedApps.set('no-hook', {
      manifest: { id: 'no-hook', hooks: {} },
      dir: '/tmp',
      pipelineHandlers: new Map(),
      serverModule: {},
    });
    await expect(
      registry.dispatchWebhook({ source: 'x', event: 'y', payload: {} }),
    ).resolves.toBeUndefined();
  });
});

describe('AppRegistry.dispatchEvent', () => {
  const db = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() };

  it('invokes each app onEvent with topic + payload', async () => {
    const registry = new AppRegistry(db as any, '/fake/apps');
    const out = path.join(os.tmpdir(), `ev-${Date.now()}.json`);
    process.env.EV_OUT = out;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evapp-'));
    fs.writeFileSync(
      path.join(dir, 'onEvent.js'),
      `module.exports = async (ctx) => require('fs').writeFileSync(process.env.EV_OUT, JSON.stringify({ appId: ctx.appId, topic: ctx.topic, payload: ctx.payload }));`,
    );
    (registry as any).loadedApps.set('splunk-enterprise', {
      manifest: { id: 'splunk-enterprise', hooks: { onEvent: 'onEvent.js' } },
      dir,
      pipelineHandlers: new Map(),
      serverModule: {},
    });

    await registry.dispatchEvent({
      topic: 'deployment.status',
      payload: { infrastructureId: 'i1', status: 'completed' },
    });

    const captured = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(captured.appId).toBe('splunk-enterprise');
    expect(captured.topic).toBe('deployment.status');
    expect(captured.payload.infrastructureId).toBe('i1');
    expect(captured.payload.status).toBe('completed');
  });

  it('does not reject when an app onEvent handler throws', async () => {
    const registry = new AppRegistry(db as any, '/fake/apps');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evbad-'));
    fs.writeFileSync(path.join(dir, 'onEvent.js'), `module.exports = async () => { throw new Error('boom'); };`);
    (registry as any).loadedApps.set('broken', {
      manifest: { id: 'broken', hooks: { onEvent: 'onEvent.js' } },
      dir,
      pipelineHandlers: new Map(),
      serverModule: {},
    });
    await expect(
      registry.dispatchEvent({ topic: 't', payload: {} }),
    ).resolves.toBeUndefined();
  });
});

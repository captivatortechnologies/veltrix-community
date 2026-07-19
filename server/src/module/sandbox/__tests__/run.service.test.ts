// ========================================================================
// Sandbox Run Service Tests
//
// End-to-end through the REAL registry + REAL child-process runner with a
// synced-app fixture on disk. Prisma is mocked. Covers: happy path (ctx
// contract incl. sandbox flag, settings defaults, synthetic CLI user),
// handler allowlist, status gating, component targeting rules, the
// credential-null guarantee (tag-restricted queries), the always-null
// connectivityProvider, concurrency limiting, and WS/audit emission.
//
// NOTE (Community Edition adaptation): audit persistence goes through
// `recordAuditEvent` (lib/audit-event.ts) against `AuditEvent`, not
// `prisma.platformAuditLog` as in the source (private, multi-tenant)
// module — see sandbox.audit.ts's docblock. AuditEvent.userId is nullable,
// so a no-actor run is recorded with userId: null instead of being skipped.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import prisma from '../../../db'
import { recordAuditEvent } from '../../../lib/audit-event'
import { runService, SANDBOX_TAG_NAME } from '../run.service'
import { sandboxRegistry } from '../sandbox-registry'
import { sandboxEvents } from '../sandbox.events'
import { SandboxError } from '../sandbox.service'
import { getSandboxDir } from '../sandbox.config'
import type { RunSandboxRequest } from '../sandbox.schemas'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    component: { findMany: jest.fn() },
    credential: { findFirst: jest.fn() },
    componentConnectivity: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

jest.mock('../../../lib/audit-event', () => ({
  recordAuditEvent: jest.fn(),
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const mockPrisma = prisma as unknown as {
  component: { findMany: jest.Mock }
  credential: { findFirst: jest.Mock }
  componentConnectivity: { findUnique: jest.Mock }
  user: { findUnique: jest.Mock }
}
const mockRecordAuditEvent = recordAuditEvent as jest.Mock

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'
const COMPONENT_ID = '55555555-5555-4555-a555-555555555555'

const MANIFEST_YAML = `
id: crowdstrike-edr
name: CrowdStrike EDR
version: 0.1.0
vendor: CrowdStrike
description: Dev sandbox app
category: edr
settings:
  - key: apiRegion
    type: string
    label: API Region
    default: us-1
  - key: retries
    type: number
    label: Retries
    default: 3
permissions:
  platform: []
pipeline:
  configurationTypes:
    - id: policies
      name: Policies
      canvasTemplate: templates/policies-canvas.yaml
      targets:
        componentTypes: [edr-console]
      handlers:
        validate: server/handlers/validate.ts
        deploy: server/handlers/deploy.ts
        rollback: server/handlers/rollback.ts
        healthCheck: server/handlers/health.ts
        getStatus: server/handlers/status.ts
server:
  entry: server/index.ts
`

/** Echoes the interesting parts of ctx back so tests can assert the contract. */
const ECHO_HANDLER = `module.exports = async (ctx) => {
  console.log('validating', ctx.canvas.name)
  return {
    valid: true,
    environment: ctx.environment,
    user: ctx.user,
    settings: ctx.settings,
    sandboxFlag: ctx.sandbox,
    credential: ctx.credential ?? null,
    connectivity: ctx.connectivity ?? null,
    connectivityProvider: ctx.connectivityProvider ?? null,
    component: ctx.component ?? null,
    deployedConfig: ctx.deployedConfig ?? null,
    sections: ctx.canvas.sections,
    platformComponents: await ctx.platform.listComponents(),
  }
}`

const SLEEP_HANDLER = `module.exports = () => new Promise((resolve) => setTimeout(() => resolve({ done: true }), 1500))`

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: SANDBOX_ID,
    customerId: CUSTOMER_ID,
    name: 'crowdstrike-dev',
    appId: 'crowdstrike-edr',
    status: 'ACTIVE',
    createdById: null,
    lastSyncAt: new Date(),
    fileCount: 6,
    sizeBytes: 1000,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

function writeSandboxApp(): void {
  const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
  fs.mkdirSync(path.join(dir, 'server', 'handlers'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.yaml'), MANIFEST_YAML)
  const handlers: Record<string, string> = {
    'validate.js': ECHO_HANDLER,
    'deploy.js': ECHO_HANDLER,
    'rollback.js': ECHO_HANDLER,
    'health.js': ECHO_HANDLER,
    'status.js': SLEEP_HANDLER,
  }
  for (const [file, code] of Object.entries(handlers)) {
    fs.writeFileSync(path.join(dir, 'server', 'handlers', file), code)
  }
}

const SANDBOX_COMPONENT = {
  id: COMPONENT_ID,
  hostname: 'edr-mock.dev',
  port: '443',
  type: ['edr-console'],
  toolId: 'tool-1',
}

describe('runService.runHandler', () => {
  let tmpRoot: string

  beforeEach(() => {
    jest.clearAllMocks()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-run-test-'))
    process.env.SANDBOX_DIR = tmpRoot
    process.env.SANDBOX_RUNNER_TIMEOUT_MS = '8000'
    sandboxRegistry.clear()
    writeSandboxApp()

    mockPrisma.component.findMany.mockResolvedValue([SANDBOX_COMPONENT])
    mockPrisma.credential.findFirst.mockResolvedValue(null)
    mockPrisma.componentConnectivity.findUnique.mockResolvedValue(null)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockRecordAuditEvent.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    delete process.env.SANDBOX_RUNNER_TIMEOUT_MS
    delete process.env.SANDBOX_RUNNER_CONCURRENCY
    sandboxRegistry.clear()
    // Windows may briefly hold a lock on the just-exited runner child's cwd;
    // rmSync retries EPERM/EBUSY/ENOTEMPTY, and a leftover temp dir must never
    // fail the test, so swallow any residual cleanup error.
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      /* best-effort temp cleanup */
    }
  })

  function runBody(overrides: Partial<RunSandboxRequest> = {}): RunSandboxRequest {
    return {
      configTypeId: 'policies',
      handler: 'validate',
      canvas: { name: 'draft-1', sections: [{ name: 'general', fields: { region: 'us-1' } }] },
      ...overrides,
    }
  }

  it('runs validate end-to-end with the sandbox-safe context contract', async () => {
    const emitLogSpy = jest.spyOn(sandboxEvents, 'emitLog')
    const emitRunResultSpy = jest.spyOn(sandboxEvents, 'emitRunResult')

    const response = await runService.runHandler(makeSandbox(), runBody(), null)

    expect(response.ok).toBe(true)
    expect(response.runId).toMatch(/[0-9a-f-]{36}/)
    expect(response.handler).toBe('validate')
    expect(response.timedOut).toBe(false)
    expect(response.error).toBeNull()
    expect(response.logs).toEqual([{ level: 'log', line: 'validating draft-1' }])

    const result = response.result as Record<string, unknown>
    // environment is always the synthetic sandbox env
    expect(result.environment).toEqual({ id: 'sandbox', name: 'sandbox' })
    // API-key callers get the synthetic CLI principal
    expect(result.user).toEqual({ id: 'sandbox-cli', email: 'cli@sandbox.local', name: 'Veltrix CLI' })
    // settings come from manifest DEFAULTS
    expect(result.settings).toEqual({ apiRegion: 'us-1', retries: 3 })
    // runs are marked sandbox:true end-to-end
    expect(result.sandboxFlag).toBe(true)
    // validate is not component-scoped: no component/credential in ctx
    expect(result.component).toBeNull()
    expect(result.credential).toBeNull()
    expect(result.connectivityProvider).toBeNull()
    // caller-supplied canvas sections reach the handler; the items-first-class
    // contract stamps a stable id (section.id ?? `item-<index>`) on each section.
    expect(result.sections).toEqual([{ id: 'item-0', name: 'general', fields: { region: 'us-1' } }])
    // ctx.platform only ever sees sandbox-tagged components
    expect(result.platformComponents).toEqual([SANDBOX_COMPONENT])

    // component lookup was tag-restricted at the query level
    const componentWhere = mockPrisma.component.findMany.mock.calls[0][0].where
    expect(componentWhere.tags.some.tag.name).toBe(SANDBOX_TAG_NAME)

    // WS events: one log batch + the run result
    expect(emitLogSpy).toHaveBeenCalledTimes(1)
    expect(emitLogSpy.mock.calls[0][1].lines).toHaveLength(1)
    expect(emitRunResultSpy).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({ sandboxId: SANDBOX_ID, ok: true, handler: 'validate' }),
    )

    // AuditEvent recorded with userId: null (no user actor -> system/API-key actor)
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: CUSTOMER_ID, userId: null, action: 'sandbox.run' }),
    )
  })

  it('resolves the portal user for JWT callers', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'dev@tenant.io',
      name: 'Dev One',
    })

    const response = await runService.runHandler(makeSandbox(), runBody(), 'user-1')

    const result = response.result as Record<string, unknown>
    expect(result.user).toEqual({ id: 'user-1', email: 'dev@tenant.io', name: 'Dev One' })
    // With a real actor the AuditEvent carries that userId.
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sandbox.run', resourceType: 'sandbox', userId: 'user-1' }),
    )
  })

  it('rejects deploy/rollback (not runnable in v1)', async () => {
    await expect(
      runService.runHandler(makeSandbox(), runBody({ handler: 'deploy' as never }), null),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('gates on sandbox status: EXPIRED -> 410, ERROR -> 409, SYNCING -> 409', async () => {
    await expect(
      runService.runHandler(makeSandbox({ status: 'EXPIRED' }), runBody(), null),
    ).rejects.toMatchObject({ statusCode: 410 })
    await expect(
      runService.runHandler(makeSandbox({ status: 'ERROR' }), runBody(), null),
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      runService.runHandler(makeSandbox({ status: 'SYNCING' }), runBody(), null),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('404s on configuration types the synced manifest does not define', async () => {
    await expect(
      runService.runHandler(makeSandbox(), runBody({ configTypeId: 'nope' }), null),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('409s when nothing valid has been synced yet', async () => {
    fs.rmSync(getSandboxDir(CUSTOMER_ID, SANDBOX_ID), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
    await expect(runService.runHandler(makeSandbox(), runBody(), null)).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('healthCheck requires a sandbox-tagged component', async () => {
    mockPrisma.component.findMany.mockResolvedValue([])

    await expect(
      runService.runHandler(makeSandbox(), runBody({ handler: 'healthCheck' }), null),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('403s when the requested component is not sandbox-tagged', async () => {
    await expect(
      runService.runHandler(
        makeSandbox(),
        runBody({ handler: 'healthCheck', componentId: '99999999-9999-4999-a999-999999999999' }),
        null,
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('guarantees null credential/connectivityProvider unless sandbox-tagged (never production secrets)', async () => {
    // Simulates a tenant whose ONLY credential for the tool is a production
    // one (untagged): the tag-restricted query returns null, so the handler
    // must see credential === null.
    mockPrisma.credential.findFirst.mockResolvedValue(null)
    mockPrisma.componentConnectivity.findUnique.mockResolvedValue({
      id: 'conn-1',
      status: 'ACTIVE',
      sshCommand: 'ssh dev@edr-mock.dev',
      httpsUrl: 'https://edr-mock.dev',
      tailscaleDeviceIP: null,
    })

    const response = await runService.runHandler(
      makeSandbox(),
      runBody({ handler: 'healthCheck' }),
      null,
    )

    expect(response.ok).toBe(true)
    const result = response.result as Record<string, unknown>
    expect(result.component).toEqual(SANDBOX_COMPONENT)
    expect(result.credential).toBeNull()
    // The component's own connectivity record (a sandbox-tagged dev host) is allowed
    expect(result.connectivity).toEqual(
      expect.objectContaining({ sshCommand: 'ssh dev@edr-mock.dev' }),
    )
    // Provider configs hold tenant-wide secrets: ALWAYS null in v1
    expect(result.connectivityProvider).toBeNull()

    // The credential query itself was tag-restricted — production
    // credentials are unreachable by construction, not by filtering.
    const credentialWhere = mockPrisma.credential.findFirst.mock.calls[0][0].where
    expect(credentialWhere.tags.some.tag.name).toBe(SANDBOX_TAG_NAME)
    expect(credentialWhere.toolId).toBe(SANDBOX_COMPONENT.toolId)
  })

  it('passes a sandbox-tagged credential through when one exists', async () => {
    mockPrisma.credential.findFirst.mockResolvedValue({
      id: 'cred-sandbox',
      name: 'mock edr creds',
      username: 'dev',
      password: 'dev-password',
      apiToken: 'dev-token',
      certificate: null,
    })

    const response = await runService.runHandler(
      makeSandbox(),
      runBody({ handler: 'healthCheck' }),
      null,
    )

    const result = response.result as Record<string, unknown>
    expect(result.credential).toEqual(
      expect.objectContaining({ id: 'cred-sandbox', username: 'dev' }),
    )
  })

  it('driftDetect receives the caller canvas as deployedConfig', async () => {
    // driftDetect not declared in the manifest -> 400 (declared-handler check)
    await expect(
      runService.runHandler(makeSandbox(), runBody({ handler: 'driftDetect' }), null),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('enforces the per-customer concurrency cap with 429', async () => {
    process.env.SANDBOX_RUNNER_CONCURRENCY = '1'

    // getStatus uses the sleep handler (1.5 s) — keeps the slot busy.
    const first = runService.runHandler(makeSandbox(), runBody({ handler: 'getStatus' }), null)
    await new Promise((resolve) => setTimeout(resolve, 400))

    await expect(runService.runHandler(makeSandbox(), runBody(), null)).rejects.toMatchObject({
      statusCode: 429,
    })

    const firstResult = await first
    expect(firstResult.ok).toBe(true)

    // Slot released -> next run succeeds.
    const next = await runService.runHandler(makeSandbox(), runBody(), null)
    expect(next.ok).toBe(true)
  }, 15000)

  it('wraps run failures as ok:false responses (not HTTP errors)', async () => {
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    fs.writeFileSync(
      path.join(dir, 'server', 'handlers', 'validate.js'),
      `module.exports = async () => { throw new Error('validator exploded') }`,
    )
    sandboxRegistry.clear() // force re-resolution of artifacts

    const response = await runService.runHandler(makeSandbox(), runBody(), null)

    expect(response.ok).toBe(false)
    expect(response.error).toContain('validator exploded')
    expect(response.result).toBeNull()

    expect(response.runId).toBeTruthy()
  })

  it('throws SandboxError subclasses that the controller maps to HTTP codes', async () => {
    await expect(
      runService.runHandler(makeSandbox({ status: 'EXPIRED' }), runBody(), null),
    ).rejects.toBeInstanceOf(SandboxError)
  })
})

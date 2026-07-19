// ========================================================================
// Sandbox Registry Tests
//
// Covers: manifest -> handler artifact resolution (.ts decl -> transpiled
// .js), missing-artifact tracking, containment of tenant-supplied handler
// paths, lazy ensureLoaded, removal, and — critically — namespace
// isolation: one tenant can never resolve another tenant's sandbox.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SandboxRegistry, sandboxRegistry } from '../sandbox-registry'
import { getSandboxDir } from '../sandbox.config'

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const CUSTOMER_A = '11111111-1111-4111-a111-111111111111'
const CUSTOMER_B = '22222222-2222-4222-a222-222222222222'
const SANDBOX_1 = '33333333-3333-4333-a333-333333333333'
const SANDBOX_2 = '44444444-4444-4444-a444-444444444444'

const MANIFEST_YAML = `
id: crowdstrike-edr
name: CrowdStrike EDR
version: 0.1.0
vendor: CrowdStrike
description: Dev sandbox app
category: edr
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
        driftDetect: server/handlers/drift.ts
server:
  entry: server/index.ts
`

/** Manifest whose validate handler tries to escape the sandbox dir. */
const ESCAPING_MANIFEST_YAML = MANIFEST_YAML.replace(
  'validate: server/handlers/validate.ts',
  'validate: ../../../../etc/evil.ts',
)

function writeSandboxApp(
  customerId: string,
  sandboxId: string,
  options: { manifest?: string; artifacts?: string[] } = {},
): string {
  const dir = getSandboxDir(customerId, sandboxId)
  fs.mkdirSync(path.join(dir, 'server', 'handlers'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.yaml'), options.manifest ?? MANIFEST_YAML)

  const artifacts = options.artifacts ?? [
    'server/handlers/validate.js',
    'server/handlers/deploy.js',
    'server/handlers/rollback.js',
    'server/handlers/health.js',
    'server/handlers/status.js',
    'server/handlers/drift.js',
  ]
  for (const artifact of artifacts) {
    const target = path.join(dir, ...artifact.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'module.exports = async () => ({ ok: true })\n')
  }
  return dir
}

describe('SandboxRegistry', () => {
  let tmpRoot: string
  let registry: SandboxRegistry

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-registry-test-'))
    process.env.SANDBOX_DIR = tmpRoot
    registry = new SandboxRegistry()
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('loads a synced app and resolves .ts handler declarations to transpiled .js artifacts', () => {
    const dir = writeSandboxApp(CUSTOMER_A, SANDBOX_1)

    const app = registry.reload(CUSTOMER_A, SANDBOX_1)

    expect(app.appId).toBe('crowdstrike-edr')
    expect(app.customerId).toBe(CUSTOMER_A)
    const ct = app.configTypes.get('policies')
    expect(ct).toBeDefined()
    expect(ct!.componentTypes).toEqual(['edr-console'])
    expect(ct!.handlerArtifacts.validate).toBe(
      path.join(dir, 'server', 'handlers', 'validate.js'),
    )
    expect(ct!.handlerArtifacts.driftDetect).toBe(
      path.join(dir, 'server', 'handlers', 'drift.js'),
    )
    expect(ct!.missingHandlers).toEqual([])
  })

  it('resolves extensionless handler declarations to their transpiled .js artifact (real-world manifest convention)', () => {
    // Mirrors how shipped apps (e.g. splunk-enterprise) declare handlers:
    // "config-types/indexes/validate" with NO extension. Production loads
    // this via require()'s auto extension-resolution; this registry never
    // require()s sandbox code, so it must resolve the same way explicitly.
    const extensionlessManifest = MANIFEST_YAML.replace(
      /validate: server\/handlers\/validate\.ts/,
      'validate: server/handlers/validate',
    )
    const dir = writeSandboxApp(CUSTOMER_A, SANDBOX_1, { manifest: extensionlessManifest })

    const app = registry.reload(CUSTOMER_A, SANDBOX_1)
    const ct = app.configTypes.get('policies')!

    expect(ct.handlerArtifacts.validate).toBe(path.join(dir, 'server', 'handlers', 'validate.js'))
    expect(ct.missingHandlers).not.toContain('validate')
  })

  it('records declared handlers whose transpiled artifact is missing', () => {
    writeSandboxApp(CUSTOMER_A, SANDBOX_1, {
      artifacts: [
        'server/handlers/deploy.js',
        'server/handlers/rollback.js',
        'server/handlers/health.js',
        'server/handlers/status.js',
        'server/handlers/drift.js',
        // validate.js intentionally absent
      ],
    })

    const app = registry.reload(CUSTOMER_A, SANDBOX_1)
    const ct = app.configTypes.get('policies')!

    expect(ct.handlerArtifacts.validate).toBeUndefined()
    expect(ct.missingHandlers).toContain('validate')
  })

  it('never resolves handler paths that escape the sandbox directory', () => {
    writeSandboxApp(CUSTOMER_A, SANDBOX_1, { manifest: ESCAPING_MANIFEST_YAML })

    const app = registry.reload(CUSTOMER_A, SANDBOX_1)
    const ct = app.configTypes.get('policies')!

    expect(ct.handlerArtifacts.validate).toBeUndefined()
    expect(ct.missingHandlers).toContain('validate')
  })

  it('throws when no valid manifest has been synced', () => {
    expect(() => registry.reload(CUSTOMER_A, SANDBOX_1)).toThrow(/Manifest not found/)
  })

  it('isolates namespaces: customer B can never see customer A sandboxes', () => {
    writeSandboxApp(CUSTOMER_A, SANDBOX_1)
    registry.reload(CUSTOMER_A, SANDBOX_1)

    // Same sandboxId, different tenant -> invisible.
    expect(registry.get(CUSTOMER_B, SANDBOX_1)).toBeUndefined()
    // And lazily loading it as customer B fails (their dir has no files).
    expect(() => registry.ensureLoaded(CUSTOMER_B, SANDBOX_1)).toThrow(/Manifest not found/)

    // Owner still resolves it.
    expect(registry.get(CUSTOMER_A, SANDBOX_1)).toBeDefined()
    expect(registry.listForCustomer(CUSTOMER_A)).toHaveLength(1)
    expect(registry.listForCustomer(CUSTOMER_B)).toHaveLength(0)
  })

  it('ensureLoaded lazily reloads from disk after a restart (empty registry)', () => {
    writeSandboxApp(CUSTOMER_A, SANDBOX_1)

    expect(registry.get(CUSTOMER_A, SANDBOX_1)).toBeUndefined()
    const app = registry.ensureLoaded(CUSTOMER_A, SANDBOX_1)
    expect(app.appId).toBe('crowdstrike-edr')
    // Second call returns the cached entry (same object).
    expect(registry.ensureLoaded(CUSTOMER_A, SANDBOX_1)).toBe(app)
  })

  it('remove() deregisters a sandbox and clear() empties the registry', () => {
    writeSandboxApp(CUSTOMER_A, SANDBOX_1)
    writeSandboxApp(CUSTOMER_A, SANDBOX_2)
    registry.reload(CUSTOMER_A, SANDBOX_1)
    registry.reload(CUSTOMER_A, SANDBOX_2)
    expect(registry.size).toBe(2)

    registry.remove(CUSTOMER_A, SANDBOX_1)
    expect(registry.get(CUSTOMER_A, SANDBOX_1)).toBeUndefined()
    expect(registry.get(CUSTOMER_A, SANDBOX_2)).toBeDefined()

    registry.clear()
    expect(registry.size).toBe(0)
  })

  it('exports a shared singleton for the server process', () => {
    expect(sandboxRegistry).toBeInstanceOf(SandboxRegistry)
  })
})

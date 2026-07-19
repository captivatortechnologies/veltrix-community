// ========================================================================
// Sandbox Config-Type Scaffold Tests
//
// Covers the editor's "Add configuration type" action: writing the canonical
// colocated layout (canvas.yaml + defaults.yaml + the six handler files),
// patching manifest.yaml (comment-preserving, no id collision), the single
// finalize, and the per-file sandbox:file-changed emissions that drive the
// editor refresh + CLI reverse-sync.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as yaml from 'js-yaml'
import prisma from '../../../db'
import { configTypeScaffold } from '../config-type-scaffold'
import { SandboxError } from '../sandbox.service'
import { getSandboxDir } from '../sandbox.config'
import { saveSyncState, type SyncState } from '../sync.service'
import { sandboxEvents } from '../sandbox.events'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    sandbox: { update: jest.fn() },
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const mockPrisma = prisma as unknown as { sandbox: { update: jest.Mock } }

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

// A manifest with an existing config type + a comment, so we can prove the
// patch is additive AND preserves the developer's comments.
const MANIFEST_YAML = `id: crowdstrike-edr
name: CrowdStrike EDR
version: 0.1.0
vendor: CrowdStrike
description: Dev sandbox app
category: edr
permissions:
  platform: []
pipeline:
  # The pipeline drives validate -> approve -> deploy -> healthCheck.
  configurationTypes:
    - id: policies
      name: Policies
      canvasTemplate: config-types/policies/canvas.yaml
      handlers:
        validate: config-types/policies/validate
        deploy: config-types/policies/deploy
        rollback: config-types/policies/rollback
        healthCheck: config-types/policies/healthCheck
        driftDetect: config-types/policies/driftDetect
        getStatus: config-types/policies/getStatus
      targets:
        componentTypes: [server]
server:
  entry: server/index.ts
`

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: SANDBOX_ID,
    customerId: CUSTOMER_ID,
    name: 'crowdstrike-dev',
    appId: 'crowdstrike-edr',
    status: 'ACTIVE',
    createdById: null,
    lastSyncAt: new Date(),
    fileCount: 1,
    sizeBytes: 512,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

/** Seed the sandbox dir with files on disk + a matching sync state. */
function seedSandbox(files: Record<string, string>): string {
  const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
  fs.mkdirSync(dir, { recursive: true })
  const state: SyncState = { files: {}, updatedAt: new Date().toISOString() }
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    state.files[rel] = { sha256: 'seed', size: Buffer.byteLength(content) }
  }
  saveSyncState(dir, state)
  return dir
}

const MUTATION = { origin: 'portal' as const, originClientId: 'client-1' }

let tmpRoot: string

beforeEach(() => {
  jest.clearAllMocks()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-cfgtype-'))
  process.env.SANDBOX_DIR = tmpRoot
  mockPrisma.sandbox.update.mockImplementation(async ({ data }: { data: any }) => makeSandbox(data))
})

afterEach(() => {
  delete process.env.SANDBOX_DIR
  delete process.env.SANDBOX_MAX_FILES
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const HANDLERS = ['validate', 'deploy', 'rollback', 'healthCheck', 'driftDetect', 'getStatus']

describe('configTypeScaffold.addConfigType', () => {
  it('scaffolds the full canonical layout and patches the manifest', async () => {
    const dir = seedSandbox({ 'manifest.yaml': MANIFEST_YAML })
    const fileChanged = jest.spyOn(sandboxEvents, 'emitFileChanged')
    const validationEvt = jest.spyOn(sandboxEvents, 'emitValidation')

    const result = await configTypeScaffold.addConfigType(
      makeSandbox(),
      { id: 'detections', name: 'Detections', componentTypes: ['server'] },
      MUTATION,
    )

    expect(result.configTypeId).toBe('detections')

    // canvas + defaults + 6 handlers all written to disk.
    expect(fs.existsSync(path.join(dir, 'config-types', 'detections', 'canvas.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config-types', 'detections', 'defaults.yaml'))).toBe(true)
    for (const h of HANDLERS) {
      expect(fs.existsSync(path.join(dir, 'config-types', 'detections', `${h}.ts`))).toBe(true)
    }

    // createdPaths lists all 8 files + the manifest.
    expect(result.createdPaths).toEqual(
      expect.arrayContaining([
        'config-types/detections/canvas.yaml',
        'config-types/detections/defaults.yaml',
        ...HANDLERS.map((h) => `config-types/detections/${h}.ts`),
        'manifest.yaml',
      ]),
    )
    expect(result.createdPaths).toHaveLength(9)

    // The manifest now declares both the original and the new config type.
    const patched = yaml.load(fs.readFileSync(path.join(dir, 'manifest.yaml'), 'utf8')) as any
    const ids = patched.pipeline.configurationTypes.map((c: any) => c.id)
    expect(ids).toContain('policies')
    expect(ids).toContain('detections')

    const added = patched.pipeline.configurationTypes.find((c: any) => c.id === 'detections')
    expect(added.name).toBe('Detections')
    expect(added.canvasTemplate).toBe('config-types/detections/canvas.yaml')
    expect(added.handlers.getStatus).toBe('config-types/detections/getStatus')
    expect(added.targets.componentTypes).toEqual(['server'])

    // One file-changed per written file; a validation event for the manifest.
    expect(fileChanged).toHaveBeenCalledTimes(9)
    expect(validationEvt).toHaveBeenCalledTimes(1)
    const emittedPaths = fileChanged.mock.calls.map((c) => (c[1] as { path: string }).path)
    expect(emittedPaths).toContain('manifest.yaml')
    expect((fileChanged.mock.calls[0][1] as { origin: string; originClientId: string }).origin).toBe('portal')
    expect((fileChanged.mock.calls[0][1] as { originClientId: string }).originClientId).toBe('client-1')
  })

  it("preserves the developer's manifest comments (textual patch, not a reserialize)", async () => {
    const dir = seedSandbox({ 'manifest.yaml': MANIFEST_YAML })

    await configTypeScaffold.addConfigType(makeSandbox(), { id: 'detections' }, MUTATION)

    const raw = fs.readFileSync(path.join(dir, 'manifest.yaml'), 'utf8')
    expect(raw).toContain('# The pipeline drives validate -> approve -> deploy -> healthCheck.')
    // The original entry survives verbatim.
    expect(raw).toContain('- id: policies')
  })

  it('defaults the display name from the id when none is given', async () => {
    const dir = seedSandbox({ 'manifest.yaml': MANIFEST_YAML })

    await configTypeScaffold.addConfigType(makeSandbox(), { id: 'threat-intel' }, MUTATION)

    const patched = yaml.load(fs.readFileSync(path.join(dir, 'manifest.yaml'), 'utf8')) as any
    const added = patched.pipeline.configurationTypes.find((c: any) => c.id === 'threat-intel')
    expect(added.name).toBe('Threat Intel')
  })

  it('rejects an invalid slug id with a 400', async () => {
    seedSandbox({ 'manifest.yaml': MANIFEST_YAML })
    for (const bad of ['Detections', 'has space', '-leading', 'trailing-', 'UPPER']) {
      await expect(
        configTypeScaffold.addConfigType(makeSandbox(), { id: bad }, MUTATION),
      ).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('rejects a duplicate config-type id with a 409', async () => {
    seedSandbox({ 'manifest.yaml': MANIFEST_YAML })
    await expect(
      configTypeScaffold.addConfigType(makeSandbox(), { id: 'policies' }, MUTATION),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409s when the sandbox has no manifest to add to', async () => {
    seedSandbox({ 'server/index.ts': 'export const x = 1\n' })
    await expect(
      configTypeScaffold.addConfigType(makeSandbox(), { id: 'detections' }, MUTATION),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('does not write any config-type files when the id collides', async () => {
    const dir = seedSandbox({ 'manifest.yaml': MANIFEST_YAML })
    await expect(
      configTypeScaffold.addConfigType(makeSandbox(), { id: 'policies' }, MUTATION),
    ).rejects.toThrow(SandboxError)
    // The rejection happens before any file write.
    expect(fs.existsSync(path.join(dir, 'config-types', 'policies', 'canvas.yaml'))).toBe(false)
  })
})

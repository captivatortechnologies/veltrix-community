// ========================================================================
// Sandbox File Service Tests (S6.2)
//
// Covers single-file read/write/delete: the reused ingest hardening
// (traversal/executable/reserved-name rejection), per-write and
// resulting-sandbox size/file-count caps, optimistic concurrency (409),
// transpile-artifact creation + cleanup, manifest re-validation, and the
// sandbox:file-changed / sandbox:validation emissions.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import prisma from '../../../db'
import { fileService } from '../file.service'
import { SandboxError } from '../sandbox.service'
import { getSandboxDir } from '../sandbox.config'
import { saveSyncState, loadSyncState, type SyncState } from '../sync.service'
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

const VALID_MANIFEST_YAML = `
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
      handlers:
        validate: server/handlers/validate.ts
        deploy: server/handlers/deploy.ts
        rollback: server/handlers/rollback.ts
        healthCheck: server/handlers/health.ts
        getStatus: server/handlers/status.ts
server:
  entry: server/index.ts
`

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: SANDBOX_ID,
    customerId: CUSTOMER_ID,
    name: 'crowdstrike-dev',
    appId: 'crowdstrike-edr',
    status: 'ACTIVE',
    createdById: null,
    lastSyncAt: new Date(),
    fileCount: 0,
    sizeBytes: 0,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

/** Seed the sandbox dir with files on disk + a matching sync state. */
function seedSandbox(files: Record<string, string | Buffer>): string {
  const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
  fs.mkdirSync(dir, { recursive: true })
  const state: SyncState = { files: {}, updatedAt: new Date().toISOString() }
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    state.files[rel] = {
      sha256: sha256(content),
      size: Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content),
    }
  }
  saveSyncState(dir, state)
  return dir
}

let tmpRoot: string

beforeEach(() => {
  jest.clearAllMocks()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-file-svc-'))
  process.env.SANDBOX_DIR = tmpRoot
  // revalidateAndPersist reads updated.expiresAt back; echo the update payload.
  mockPrisma.sandbox.update.mockImplementation(async ({ data }: { data: any }) => makeSandbox(data))
})

afterEach(() => {
  delete process.env.SANDBOX_DIR
  delete process.env.SANDBOX_MAX_BYTES
  delete process.env.SANDBOX_MAX_FILES
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

describe('fileService.readFile', () => {
  it('returns UTF-8 content, server-computed sha256 and size for a text file', () => {
    const content = 'export const register = () => "ok"\n'
    seedSandbox({ 'server/index.ts': content })

    const result = fileService.readFile(makeSandbox(), 'server/index.ts')

    expect(result).toEqual({
      path: 'server/index.ts',
      sha256: sha256(content),
      size: Buffer.byteLength(content),
      content,
      encoding: 'utf8',
      truncated: false,
    })
  })

  it('404s when the path is not tracked in the sync state', () => {
    seedSandbox({ 'server/index.ts': 'x' })
    expect(() => fileService.readFile(makeSandbox(), 'server/missing.ts')).toThrow(SandboxError)
    try {
      fileService.readFile(makeSandbox(), 'server/missing.ts')
    } catch (e) {
      expect((e as SandboxError).statusCode).toBe(404)
    }
  })

  it('404s when the state references a file that is gone from disk', () => {
    const dir = seedSandbox({ 'server/index.ts': 'x' })
    fs.rmSync(path.join(dir, 'server', 'index.ts'))
    expect(() => fileService.readFile(makeSandbox(), 'server/index.ts')).toThrow(/not present/)
  })

  it('returns base64 for binary content', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00])
    seedSandbox({ 'assets/logo.bin': binary })

    const result = fileService.readFile(makeSandbox(), 'assets/logo.bin')

    expect(result.encoding).toBe('base64')
    expect(Buffer.from(result.content, 'base64')).toEqual(binary)
    expect(result.truncated).toBe(false)
  })

  it('truncates text above 256 KB but reports the full size + hash', () => {
    const big = 'a'.repeat(300 * 1024)
    seedSandbox({ 'big.txt': big })

    const result = fileService.readFile(makeSandbox(), 'big.txt')

    expect(result.truncated).toBe(true)
    expect(result.encoding).toBe('utf8')
    expect(result.content.length).toBe(256 * 1024)
    expect(result.size).toBe(300 * 1024) // full size, not the truncated slice
    expect(result.sha256).toBe(sha256(big)) // hash of the FULL file
  })

  it('rejects an unsafe path before touching disk', () => {
    seedSandbox({ 'server/index.ts': 'x' })
    expect(() => fileService.readFile(makeSandbox(), '../../../etc/passwd')).toThrow(SandboxError)
  })
})

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------

describe('fileService.writeFile', () => {
  const emit = { origin: 'portal' as const, originClientId: 'client-1' }

  it('creates a new server .ts, writes the transpiled artifact and updates state', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    const fileChanged = jest.spyOn(sandboxEvents, 'emitFileChanged')
    const validation = jest.spyOn(sandboxEvents, 'emitValidation')

    const content = 'export const handler = (): string => "hello"\n'
    const result = await fileService.writeFile(
      makeSandbox(),
      { path: 'server/foo.ts', content, encoding: 'utf8', originClientId: 'client-1' },
      emit,
    )

    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    expect(result.sha256).toBe(sha256(content))
    expect(result.size).toBe(Buffer.byteLength(content))
    expect(fs.readFileSync(path.join(dir, 'server', 'foo.ts'), 'utf8')).toBe(content)
    // transpiled artifact created next to the source
    const artifact = fs.readFileSync(path.join(dir, 'server', 'foo.js'), 'utf8')
    expect(artifact).toContain('exports')
    // state now tracks the new file
    expect(loadSyncState(dir).files['server/foo.ts'].sha256).toBe(sha256(content))
    // manifest re-validated → sandbox stays valid
    expect(result.validation.valid).toBe(true)
    expect(result.validation.transpiledCount).toBe(1)

    // events emitted with echo-guard metadata
    expect(fileChanged).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({
        sandboxId: SANDBOX_ID,
        path: 'server/foo.ts',
        sha256: sha256(content),
        previousSha256: null,
        origin: 'portal',
        originClientId: 'client-1',
      }),
    )
    expect(validation).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({ sandboxId: SANDBOX_ID, path: 'server/foo.ts' }),
    )
  })

  it('overwrites an existing file when expectedSha256 matches, surfacing previousSha256', async () => {
    const original = 'export const x = 1\n'
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML, 'server/x.ts': original })
    const fileChanged = jest.spyOn(sandboxEvents, 'emitFileChanged')

    const next = 'export const x = 2\n'
    const result = await fileService.writeFile(
      makeSandbox(),
      { path: 'server/x.ts', content: next, encoding: 'utf8', expectedSha256: sha256(original) },
      emit,
    )

    expect(result.sha256).toBe(sha256(next))
    expect(fileChanged).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({ previousSha256: sha256(original), sha256: sha256(next) }),
    )
  })

  it('409s when expectedSha256 is stale (another peer already wrote)', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML, 'server/x.ts': 'export const x = 1\n' })

    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: 'server/x.ts', content: 'y', encoding: 'utf8', expectedSha256: 'f'.repeat(64) },
        emit,
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('409s when expectedSha256 is supplied for a file that does not exist', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: 'server/new.ts', content: 'y', encoding: 'utf8', expectedSha256: 'a'.repeat(64) },
        emit,
      ),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects path traversal', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: '../../evil.ts', content: 'x', encoding: 'utf8' },
        emit,
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects executable extensions', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.writeFile(makeSandbox(), { path: 'run.sh', content: 'x', encoding: 'utf8' }, emit),
    ).rejects.toThrow(/executable/i)
  })

  it('rejects reserved .veltrix* names', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: '.veltrix-sync-state.json', content: '{}', encoding: 'utf8' },
        emit,
      ),
    ).rejects.toThrow(/reserved/i)
  })

  it('413s a single write above the per-file byte cap', async () => {
    process.env.SANDBOX_MAX_BYTES = '16'
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: 'server/big.ts', content: 'x'.repeat(64), encoding: 'utf8' },
        emit,
      ),
    ).rejects.toMatchObject({ statusCode: 413 })
  })

  it('413s when the write would exceed the sandbox file-count cap', async () => {
    process.env.SANDBOX_MAX_FILES = '1'
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML }) // already 1 file
    await expect(
      fileService.writeFile(
        makeSandbox(),
        { path: 'server/second.ts', content: 'x', encoding: 'utf8' },
        emit,
      ),
    ).rejects.toMatchObject({ statusCode: 413 })
  })

  it('decodes base64 content and stores the raw bytes', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    const raw = Buffer.from([0x00, 0x10, 0x20, 0x30])
    const result = await fileService.writeFile(
      makeSandbox(),
      { path: 'assets/blob.bin', content: raw.toString('base64'), encoding: 'base64' },
      emit,
    )
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    expect(fs.readFileSync(path.join(dir, 'assets', 'blob.bin'))).toEqual(raw)
    expect(result.sha256).toBe(sha256(raw))
  })

  it('re-validates the manifest: a broken manifest write yields validation.valid=false', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    const result = await fileService.writeFile(
      makeSandbox(),
      { path: 'manifest.yaml', content: 'not: [valid yaml: :::', encoding: 'utf8' },
      emit,
    )
    expect(result.validation.valid).toBe(false)
    expect(result.validation.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// deleteFile
// ---------------------------------------------------------------------------

describe('fileService.deleteFile', () => {
  const emit = { origin: 'cli' as const, originClientId: 'cli-1' }

  it('removes the file and its transpiled artifact, updates state and emits', async () => {
    const dir = seedSandbox({
      'manifest.yaml': VALID_MANIFEST_YAML,
      'server/foo.ts': 'export const y = 1\n',
    })
    // simulate the transpiled artifact a prior write/sync produced
    fs.writeFileSync(path.join(dir, 'server', 'foo.js'), '// artifact')
    const fileChanged = jest.spyOn(sandboxEvents, 'emitFileChanged')

    const result = await fileService.deleteFile(makeSandbox(), 'server/foo.ts', emit)

    expect(result.deleted).toBe(true)
    expect(fs.existsSync(path.join(dir, 'server', 'foo.ts'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'server', 'foo.js'))).toBe(false) // artifact cleaned
    expect(loadSyncState(dir).files['server/foo.ts']).toBeUndefined()
    expect(fileChanged).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({
        path: 'server/foo.ts',
        sha256: '', // deletion marker
        previousSha256: sha256('export const y = 1\n'),
        origin: 'cli',
        originClientId: 'cli-1',
      }),
    )
  })

  it('404s when deleting a file that is not tracked', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.deleteFile(makeSandbox(), 'server/nope.ts', emit),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an unsafe path', async () => {
    seedSandbox({ 'manifest.yaml': VALID_MANIFEST_YAML })
    await expect(
      fileService.deleteFile(makeSandbox(), '../../etc/passwd', emit),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

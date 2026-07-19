// ========================================================================
// Sandbox Sync Service Tests
//
// Covers: manifest diff logic, tar ingest hardening (path traversal,
// executables, symlinks, size/file-count caps, reserved names) and the
// end-to-end ingest happy path (extract -> state -> validate -> transpile).
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as tar from 'tar'
import prisma from '../../../db'
import {
  computeManifestDiff,
  validateTarEntries,
  assertSafeSyncPath,
  loadSyncState,
  saveSyncState,
  syncService,
  listFiles,
  getManifestSummary,
  SYNC_STATE_FILENAME,
  type SyncState,
  type TarEntryMeta,
} from '../sync.service'
import { SandboxError } from '../sandbox.service'
import { getSandboxDir } from '../sandbox.config'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    sandbox: {
      update: jest.fn(),
    },
  },
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
  sandbox: { update: jest.Mock }
}

const LIMITS = { maxFiles: 10, maxBytes: 1024 * 1024 }

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: SANDBOX_ID,
    customerId: CUSTOMER_ID,
    name: 'crowdstrike-dev',
    appId: 'crowdstrike-edr',
    status: 'ACTIVE',
    createdById: null,
    lastSyncAt: null,
    fileCount: 0,
    sizeBytes: 0,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

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

describe('computeManifestDiff', () => {
  const state: SyncState = {
    files: {
      'manifest.yaml': { sha256: 'a'.repeat(64), size: 100 },
      'server/index.ts': { sha256: 'b'.repeat(64), size: 200 },
      'server/old.ts': { sha256: 'c'.repeat(64), size: 300 },
    },
    updatedAt: new Date().toISOString(),
  }

  it('requests upload for new and changed files, delete for removed ones', () => {
    const diff = computeManifestDiff(state, [
      { path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 100 }, // unchanged
      { path: 'server/index.ts', sha256: 'd'.repeat(64), size: 210 }, // changed
      { path: 'server/new.ts', sha256: 'e'.repeat(64), size: 50 }, // new
    ])

    expect(diff.upload.sort()).toEqual(['server/index.ts', 'server/new.ts'])
    expect(diff.delete).toEqual(['server/old.ts'])
  })

  it('returns empty lists when client and server are in sync', () => {
    const diff = computeManifestDiff(state, [
      { path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 100 },
      { path: 'server/index.ts', sha256: 'b'.repeat(64), size: 200 },
      { path: 'server/old.ts', sha256: 'c'.repeat(64), size: 300 },
    ])

    expect(diff.upload).toEqual([])
    expect(diff.delete).toEqual([])
  })

  it('requests everything on first sync (empty state)', () => {
    const diff = computeManifestDiff({ files: {}, updatedAt: '' }, [
      { path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 100 },
    ])

    expect(diff.upload).toEqual(['manifest.yaml'])
    expect(diff.delete).toEqual([])
  })

  it('normalizes windows-style and ./-prefixed paths before diffing', () => {
    const diff = computeManifestDiff(state, [
      { path: './manifest.yaml', sha256: 'a'.repeat(64), size: 100 },
      { path: 'server\\index.ts', sha256: 'b'.repeat(64), size: 200 },
      { path: 'server/old.ts', sha256: 'c'.repeat(64), size: 300 },
    ])

    expect(diff.upload).toEqual([])
    expect(diff.delete).toEqual([])
  })
})

describe('assertSafeSyncPath', () => {
  it.each([
    ['../../../etc/passwd', 'traversal'],
    ['server/../../escape.ts', 'embedded traversal'],
    ['/etc/passwd', 'absolute posix'],
    ['C:/windows/system32/evil.dll', 'drive letter'],
    ['file:stream', 'NTFS alternate data stream'],
    ['run.sh', 'shell script'],
    ['tool.exe', 'executable'],
    ['script.bat', 'batch file'],
    ['deploy.cmd', 'cmd file'],
    ['attack.ps1', 'powershell'],
    ['.veltrix-sync-state.json', 'reserved state file'],
    ['nested/.veltrix-anything', 'reserved prefix'],
    ['bad\0null.ts', 'null byte'],
  ])('rejects %s (%s)', (unsafePath) => {
    expect(() => assertSafeSyncPath(unsafePath)).toThrow(SandboxError)
  })

  it.each([['manifest.yaml'], ['server/handlers/deploy.ts'], ['templates/canvas.yaml'], ['README.md']])(
    'accepts %s',
    (safePath) => {
      expect(() => assertSafeSyncPath(safePath)).not.toThrow()
    },
  )
})

describe('validateTarEntries (ingest hardening)', () => {
  const file = (p: string, size = 10): TarEntryMeta => ({ path: p, size, type: 'File' })

  it('rejects path traversal entries', () => {
    expect(() => validateTarEntries([file('../outside.ts')], LIMITS)).toThrow(/traversal|Invalid/)
  })

  it('rejects executable entries', () => {
    for (const bad of ['x.sh', 'x.bat', 'x.exe', 'x.cmd', 'x.ps1']) {
      expect(() => validateTarEntries([file(bad)], LIMITS)).toThrow(/executable/i)
    }
  })

  it('rejects symlink and hardlink entries', () => {
    expect(() =>
      validateTarEntries([{ path: 'link.ts', size: 0, type: 'SymbolicLink' }], LIMITS),
    ).toThrow(/forbidden type/)
    expect(() =>
      validateTarEntries([{ path: 'link.ts', size: 0, type: 'Link' }], LIMITS),
    ).toThrow(/forbidden type/)
  })

  it('rejects archives above the file-count cap', () => {
    const entries = Array.from({ length: 11 }, (_, i) => file(`f${i}.ts`))
    expect(() => validateTarEntries(entries, LIMITS)).toThrow(/file limit/)
  })

  it('rejects archives above the total-size cap', () => {
    const entries = [file('big1.ts', 600 * 1024), file('big2.ts', 600 * 1024)]
    expect(() => validateTarEntries(entries, LIMITS)).toThrow(/size limit/)
  })

  it('rejects entries that would overwrite the reserved state file', () => {
    expect(() => validateTarEntries([file(SYNC_STATE_FILENAME)], LIMITS)).toThrow(/reserved/)
  })

  it('accepts a valid listing and returns normalized allowed paths', () => {
    const allowed = validateTarEntries(
      [
        { path: 'server/', size: 0, type: 'Directory' },
        file('./manifest.yaml'),
        file('server\\index.ts'),
      ],
      LIMITS,
    )
    expect([...allowed].sort()).toEqual(['manifest.yaml', 'server/index.ts'])
  })
})

describe('syncService.ingestFiles (end-to-end)', () => {
  let tmpRoot: string
  let stagingDir: string

  beforeEach(() => {
    jest.clearAllMocks()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-sync-test-'))
    stagingDir = path.join(tmpRoot, '_staging')
    fs.mkdirSync(stagingDir, { recursive: true })
    process.env.SANDBOX_DIR = path.join(tmpRoot, 'sandboxes')
    mockPrisma.sandbox.update.mockImplementation(async ({ data }: { data: any }) =>
      makeSandbox(data),
    )
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    delete process.env.SANDBOX_MAX_BYTES
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  async function buildArchive(files: Record<string, string>): Promise<Buffer> {
    const names = Object.keys(files)
    for (const name of names) {
      const target = path.join(stagingDir, ...name.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, files[name])
    }
    const archivePath = path.join(tmpRoot, `archive-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`)
    await tar.create({ gzip: true, cwd: stagingDir, file: archivePath }, names)
    return fs.readFileSync(archivePath)
  }

  it('extracts a valid app delta, records state, validates and transpiles', async () => {
    const archive = await buildArchive({
      'manifest.yaml': VALID_MANIFEST_YAML,
      'server/index.ts': 'export const register = (): string => "ok"\n',
      'client/index.tsx': 'export const Page = () => null\n',
    })

    const result = await syncService.ingestFiles(makeSandbox(), archive)

    expect(result.validation.valid).toBe(true)
    expect(result.validation.errors).toEqual([])
    expect(result.validation.manifest).toEqual({
      id: 'crowdstrike-edr',
      name: 'CrowdStrike EDR',
      version: '0.1.0',
    })
    expect(result.status).toBe('ACTIVE')
    expect(result.fileCount).toBe(3)

    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)

    // server-side TS transpiled to cjs; client/ skipped
    expect(result.validation.transpiledCount).toBe(1)
    const compiled = fs.readFileSync(path.join(sandboxDir, 'server', 'index.js'), 'utf-8')
    expect(compiled).toContain('exports')
    expect(fs.existsSync(path.join(sandboxDir, 'client', 'index.js'))).toBe(false)

    // sync state written with server-computed hashes
    const state = loadSyncState(sandboxDir)
    expect(Object.keys(state.files).sort()).toEqual([
      'client/index.tsx',
      'manifest.yaml',
      'server/index.ts',
    ])
    expect(state.files['server/index.ts'].sha256).toMatch(/^[a-f0-9]{64}$/)

    // row updated: status ACTIVE, lastSyncAt + renewed expiry
    const lastUpdate = mockPrisma.sandbox.update.mock.calls.at(-1)[0]
    expect(lastUpdate.data.status).toBe('ACTIVE')
    expect(lastUpdate.data.lastSyncAt).toBeInstanceOf(Date)
    expect(lastUpdate.data.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('marks the sandbox ERROR when the manifest is missing', async () => {
    const archive = await buildArchive({
      'server/index.ts': 'export {}\n',
    })

    const result = await syncService.ingestFiles(makeSandbox(), archive)

    expect(result.validation.valid).toBe(false)
    expect(result.validation.errors.join(' ')).toContain('manifest.yaml')
    expect(result.status).toBe('ERROR')
  })

  it('rejects archives containing executables without writing any file', async () => {
    const archive = await buildArchive({
      'manifest.yaml': VALID_MANIFEST_YAML,
      'evil.sh': '#!/bin/sh\nrm -rf /\n',
    })

    await expect(syncService.ingestFiles(makeSandbox(), archive)).rejects.toThrow(/executable/i)

    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    expect(fs.existsSync(path.join(sandboxDir, 'evil.sh'))).toBe(false)
    expect(fs.existsSync(path.join(sandboxDir, 'manifest.yaml'))).toBe(false)
  })

  it('rejects archive buffers above SANDBOX_MAX_BYTES', async () => {
    process.env.SANDBOX_MAX_BYTES = '1024'
    const archive = await buildArchive({
      'manifest.yaml': VALID_MANIFEST_YAML.repeat(20),
    })

    await expect(syncService.ingestFiles(makeSandbox(), archive)).rejects.toMatchObject({
      statusCode: 413,
    })
  })

  it('rejects corrupt (non-gzip) bodies', async () => {
    await expect(
      syncService.ingestFiles(makeSandbox(), Buffer.from('definitely not a tarball')),
    ).rejects.toThrow()
  })
})

describe('syncService.applyManifest', () => {
  let tmpRoot: string

  beforeEach(() => {
    jest.clearAllMocks()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-manifest-test-'))
    process.env.SANDBOX_DIR = tmpRoot
    mockPrisma.sandbox.update.mockResolvedValue(makeSandbox())
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects manifests containing unsafe paths', async () => {
    await expect(
      syncService.applyManifest(makeSandbox(), [
        { path: '../../evil.ts', sha256: 'a'.repeat(64), size: 10 },
      ]),
    ).rejects.toBeInstanceOf(SandboxError)
  })

  it('deletes stale files (and their transpile artifacts) and renews the TTL', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    fs.mkdirSync(path.join(sandboxDir, 'server'), { recursive: true })
    fs.writeFileSync(path.join(sandboxDir, 'server', 'old.ts'), 'export {}')
    fs.writeFileSync(path.join(sandboxDir, 'server', 'old.js'), '// artifact')
    fs.writeFileSync(path.join(sandboxDir, 'manifest.yaml'), 'id: x')
    fs.writeFileSync(
      path.join(sandboxDir, SYNC_STATE_FILENAME),
      JSON.stringify({
        files: {
          'manifest.yaml': { sha256: 'a'.repeat(64), size: 5 },
          'server/old.ts': { sha256: 'b'.repeat(64), size: 9 },
        },
        updatedAt: new Date().toISOString(),
      }),
    )

    const diff = await syncService.applyManifest(makeSandbox(), [
      { path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 5 },
    ])

    expect(diff.upload).toEqual([])
    expect(diff.delete).toEqual(['server/old.ts'])
    expect(fs.existsSync(path.join(sandboxDir, 'server', 'old.ts'))).toBe(false)
    expect(fs.existsSync(path.join(sandboxDir, 'server', 'old.js'))).toBe(false)

    const update = mockPrisma.sandbox.update.mock.calls[0][0]
    expect(update.data.fileCount).toBe(1)
    expect(update.data.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

// ---------------------------------------------------------------------------
// Detail-view read helpers (S5 UI): listFiles + getManifestSummary
// ---------------------------------------------------------------------------

describe('listFiles', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-files-test-'))
    process.env.SANDBOX_DIR = tmpRoot
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns an empty page for a sandbox that has never synced (no state file on disk)', () => {
    const page = listFiles(makeSandbox(), { limit: 500, offset: 0 })
    expect(page).toEqual({ files: [], totalCount: 0, totalBytes: 0, limit: 500, offset: 0 })
  })

  it('lists synced files sorted by path with correct totals', () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    saveSyncState(sandboxDir, {
      files: {
        'server/handlers/validate.ts': { sha256: 'b'.repeat(64), size: 200 },
        'manifest.yaml': { sha256: 'a'.repeat(64), size: 100 },
        'server/index.ts': { sha256: 'c'.repeat(64), size: 50 },
      },
      updatedAt: new Date().toISOString(),
    })

    const page = listFiles(makeSandbox(), { limit: 500, offset: 0 })

    expect(page.files.map((f) => f.path)).toEqual([
      'manifest.yaml',
      'server/handlers/validate.ts',
      'server/index.ts',
    ])
    expect(page.totalCount).toBe(3)
    expect(page.totalBytes).toBe(350)
    expect(page.files[0]).toEqual({ path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 100 })
  })

  it('paginates with limit/offset while keeping totals over the FULL set', () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    const files: SyncState['files'] = {}
    for (let i = 0; i < 5; i += 1) {
      files[`f${i}.ts`] = { sha256: `${i}`.repeat(64).slice(0, 64), size: 10 }
    }
    saveSyncState(sandboxDir, { files, updatedAt: new Date().toISOString() })

    const page1 = listFiles(makeSandbox(), { limit: 2, offset: 0 })
    expect(page1.files.map((f) => f.path)).toEqual(['f0.ts', 'f1.ts'])
    expect(page1.totalCount).toBe(5)
    expect(page1.totalBytes).toBe(50)

    const page2 = listFiles(makeSandbox(), { limit: 2, offset: 2 })
    expect(page2.files.map((f) => f.path)).toEqual(['f2.ts', 'f3.ts'])

    const page3 = listFiles(makeSandbox(), { limit: 2, offset: 4 })
    expect(page3.files.map((f) => f.path)).toEqual(['f4.ts'])
  })

  it('path-escape safety: never touches the filesystem for individual entries, only echoes stored metadata', () => {
    // Simulate a tampered/legacy state entry that (if it were ever used to
    // build a disk path) would escape the sandbox directory. Deliberately
    // never create anything at that path on disk: if listFiles ever tried
    // to read/stat the entry itself (rather than just echoing the metadata
    // already recorded in the trusted JSON state), this would throw ENOENT.
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    saveSyncState(sandboxDir, {
      files: {
        '../../../etc/passwd': { sha256: 'a'.repeat(64), size: 999 },
        'manifest.yaml': { sha256: 'b'.repeat(64), size: 5 },
      },
      updatedAt: new Date().toISOString(),
    })

    const page = listFiles(makeSandbox(), { limit: 500, offset: 0 })

    expect(page.totalCount).toBe(2)
    expect(page.files.find((f) => f.path === '../../../etc/passwd')).toEqual({
      path: '../../../etc/passwd',
      sha256: 'a'.repeat(64),
      size: 999,
    })
  })
})

describe('getManifestSummary', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-manifest-summary-test-'))
    process.env.SANDBOX_DIR = tmpRoot
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns null for a sandbox that has never completed a sync', async () => {
    const summary = await getManifestSummary(makeSandbox({ lastSyncAt: null }))
    expect(summary).toBeNull()
  })

  it('reports missing manifest.yaml as an error once a sync has completed', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    saveSyncState(sandboxDir, {
      files: { 'server/index.ts': { sha256: 'a'.repeat(64), size: 10 } },
      updatedAt: new Date().toISOString(),
    })
    fs.mkdirSync(path.join(sandboxDir, 'server'), { recursive: true })
    fs.writeFileSync(path.join(sandboxDir, 'server', 'index.ts'), 'export {}')

    const summary = await getManifestSummary(makeSandbox({ lastSyncAt: new Date() }))

    expect(summary).not.toBeNull()
    expect(summary!.valid).toBe(false)
    expect(summary!.errors.join(' ')).toContain('manifest.yaml')
    expect(summary!.configTypes).toEqual([])
  })

  it('summarizes configuration types with their declared handlers, and counts transpiled sources', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    fs.mkdirSync(path.join(sandboxDir, 'server', 'handlers'), { recursive: true })
    fs.writeFileSync(path.join(sandboxDir, 'manifest.yaml'), VALID_MANIFEST_YAML)
    fs.writeFileSync(path.join(sandboxDir, 'server', 'index.ts'), 'export const register = () => "ok"\n')
    saveSyncState(sandboxDir, {
      files: {
        'manifest.yaml': { sha256: 'a'.repeat(64), size: VALID_MANIFEST_YAML.length },
        'server/index.ts': { sha256: 'b'.repeat(64), size: 40 },
      },
      updatedAt: new Date().toISOString(),
    })

    const summary = await getManifestSummary(makeSandbox({ lastSyncAt: new Date() }))

    expect(summary).toEqual({
      appId: 'crowdstrike-edr',
      name: 'CrowdStrike EDR',
      version: '0.1.0',
      configTypes: [
        {
          id: 'policies',
          name: 'Policies',
          handlers: ['validate', 'deploy', 'rollback', 'healthCheck', 'getStatus'],
        },
      ],
      // No `client` block in VALID_MANIFEST_YAML — see the dedicated S6.5 test below
      // for the populated case.
      client: null,
      valid: true,
      errors: [],
      warnings: [],
      transpiledCount: 1,
    })
  })

  it('summarizes the manifest client block (S6.5 sandbox preview nav contract)', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    const manifestWithClient =
      VALID_MANIFEST_YAML +
      [
        'client:',
        '  entry: client/index',
        '  pages:',
        '    - path: /widgets',
        '      component: WidgetsPage',
        '      label: Widgets',
        '      nav: sidebar',
        '      order: 1',
      ].join('\n') +
      '\n'
    fs.mkdirSync(path.join(sandboxDir, 'server'), { recursive: true })
    fs.writeFileSync(path.join(sandboxDir, 'manifest.yaml'), manifestWithClient)
    fs.writeFileSync(path.join(sandboxDir, 'server', 'index.ts'), 'export {}')
    saveSyncState(sandboxDir, {
      files: { 'manifest.yaml': { sha256: 'a'.repeat(64), size: manifestWithClient.length } },
      updatedAt: new Date().toISOString(),
    })

    const summary = await getManifestSummary(makeSandbox({ lastSyncAt: new Date() }))

    expect(summary!.client).toEqual({
      entry: 'client/index',
      pages: [
        expect.objectContaining({
          path: '/widgets',
          component: 'WidgetsPage',
          label: 'Widgets',
          nav: 'sidebar',
          order: 1,
        }),
      ],
    })
  })

  it('surfaces a transpile error without discarding the parsed manifest summary', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    fs.mkdirSync(path.join(sandboxDir, 'server'), { recursive: true })
    fs.writeFileSync(path.join(sandboxDir, 'manifest.yaml'), VALID_MANIFEST_YAML)
    // Invalid TypeScript — esbuild will fail to transform this.
    fs.writeFileSync(path.join(sandboxDir, 'server', 'index.ts'), 'export const x: = {{{ syntax error')
    saveSyncState(sandboxDir, {
      files: {
        'manifest.yaml': { sha256: 'a'.repeat(64), size: VALID_MANIFEST_YAML.length },
        'server/index.ts': { sha256: 'b'.repeat(64), size: 40 },
      },
      updatedAt: new Date().toISOString(),
    })

    const summary = await getManifestSummary(makeSandbox({ lastSyncAt: new Date() }))

    expect(summary!.valid).toBe(false)
    expect(summary!.errors.some((e) => /Transpile failed/.test(e))).toBe(true)
    expect(summary!.transpiledCount).toBe(0)
    // The manifest itself still parsed fine, so config type info is preserved.
    expect(summary!.appId).toBe('crowdstrike-edr')
    expect(summary!.configTypes).toHaveLength(1)
  })

  it('warns when the manifest id does not match the sandbox app id', async () => {
    const sandboxDir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    saveSyncState(sandboxDir, {
      files: { 'manifest.yaml': { sha256: 'a'.repeat(64), size: VALID_MANIFEST_YAML.length } },
      updatedAt: new Date().toISOString(),
    })
    fs.writeFileSync(path.join(sandboxDir, 'manifest.yaml'), VALID_MANIFEST_YAML)

    const summary = await getManifestSummary(
      makeSandbox({ lastSyncAt: new Date(), appId: 'a-totally-different-app' }),
    )

    expect(summary!.warnings.join(' ')).toContain('does not match the sandbox app')
  })
})

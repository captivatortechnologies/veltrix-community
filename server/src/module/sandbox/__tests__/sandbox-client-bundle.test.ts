// ========================================================================
// Sandbox Client Bundle Tests (S6.5)
//
// Unit-tests resolution + esbuild bundling + caching directly against
// getSandboxClientBundle(), seeding a real temp sandbox directory (same
// pattern as file.service.test.ts / sync.service.test.ts). HTTP-layer
// auth/tenancy wiring is covered in sandbox.route.client-bundle.test.ts.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getSandboxDir } from '../sandbox.config'
import { SandboxError } from '../sandbox.service'
import { getSandboxClientBundle, clearSandboxClientBundleCache } from '../sandbox-client-bundle'

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: SANDBOX_ID,
    customerId: CUSTOMER_ID,
    name: 'local-dev',
    appId: 'fictional-app',
    status: 'ACTIVE',
    createdById: null,
    lastSyncAt: new Date(),
    fileCount: 2,
    sizeBytes: 100,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never
}

function baseManifestYaml(extra = ''): string {
  return `
id: fictional-app
name: Fictional App
version: 0.1.0
vendor: Acme
description: Test sandbox app
category: test
permissions:
  platform: []
pipeline:
  configurationTypes:
    - id: widgets
      name: Widgets
      canvasTemplate: templates/widgets-canvas.yaml
      handlers:
        validate: server/handlers/validate.ts
        deploy: server/handlers/deploy.ts
        rollback: server/handlers/rollback.ts
        healthCheck: server/handlers/health.ts
        getStatus: server/handlers/status.ts
server:
  entry: server/index.ts
${extra}
`
}

const CLIENT_INDEX_TSX = [
  "import React from 'react'",
  "import { useAppContext } from '@veltrixsecops/app-sdk/hooks'",
  '',
  'function Dashboard() {',
  '  const ctx = useAppContext()',
  '  return <div>hello {ctx.appId}</div>',
  '}',
  '',
  "export default { id: 'fictional-app', pages: { Dashboard } }",
  '',
].join('\n')

function writeFile(sandboxDir: string, rel: string, content: string): void {
  const target = path.join(sandboxDir, ...rel.split('/'))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

/** Force a strictly-newer mtime than whatever the file currently has, avoiding
 * mtime-resolution flakiness in a fast test (see cache-invalidation test below). */
function bumpMtime(filePath: string, aheadMs: number): void {
  const future = new Date(Date.now() + aheadMs)
  fs.utimesSync(filePath, future, future)
}

let tmpRoot: string

beforeEach(() => {
  clearSandboxClientBundleCache()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-sandbox-client-bundle-'))
  process.env.SANDBOX_DIR = tmpRoot
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('getSandboxClientBundle', () => {
  it('404s when the sandbox has never synced (no manifest.yaml at all)', async () => {
    const sandbox = makeSandbox({ lastSyncAt: null })
    // Directory exists (pre-created on sandbox creation) but is empty.
    fs.mkdirSync(getSandboxDir(CUSTOMER_ID, SANDBOX_ID), { recursive: true })

    await expect(getSandboxClientBundle(sandbox)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Sandbox app has no client bundle',
    })
  })

  it('404s when the manifest declares no client block at all', async () => {
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    writeFile(dir, 'manifest.yaml', baseManifestYaml())

    await expect(getSandboxClientBundle(makeSandbox())).rejects.toBeInstanceOf(SandboxError)
    await expect(getSandboxClientBundle(makeSandbox())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s when client.entry is declared but no candidate file resolves on disk', async () => {
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
    // No client/index.* file written at all.

    await expect(getSandboxClientBundle(makeSandbox())).rejects.toMatchObject({
      statusCode: 404,
      message: 'Sandbox app has no client bundle',
    })
  })

  it('404s when the manifest fails to parse', async () => {
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    writeFile(dir, 'manifest.yaml', 'not: [valid, manifest') // malformed YAML

    await expect(getSandboxClientBundle(makeSandbox())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a client.entry that resolves outside the sandbox directory (containment)', async () => {
    const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
    // A real file exists at the escape target so resolution would succeed if
    // containment were not enforced first.
    const outside = path.join(tmpRoot, 'outside-index.tsx')
    fs.writeFileSync(outside, CLIENT_INDEX_TSX)
    writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: ../outside-index\n'))

    await expect(getSandboxClientBundle(makeSandbox())).rejects.toMatchObject({
      statusCode: 404,
      message: 'Sandbox app has no client bundle',
    })
  })

  it(
    'resolves an extensionless client.entry (client/index -> client/index.tsx) and applies host-runtime shims',
    async () => {
      const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
      writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      writeFile(dir, 'client/index.tsx', CLIENT_INDEX_TSX)

      const code = await getSandboxClientBundle(makeSandbox())

      // The shim reads the host-installed global...
      expect(code).toContain('__VELTRIX_APP_RUNTIME__')
      // ...and no bare react / sdk import survives bundling.
      expect(code).not.toMatch(/from\s*["']react["']/)
      expect(code).not.toMatch(/require\(\s*["']react["']\s*\)/)
      expect(code).not.toMatch(/from\s*["']@veltrixsecops\/app-sdk/)
      expect(code).toMatch(/export\s*\{/)
    },
    20000,
  )

  it(
    'shims @veltrixsecops/app-sdk/ui to the host runtime global too (reuses hostRuntimeShimPlugin — ' +
      'sandbox preview gets the same rich component library as installed apps)',
    async () => {
      const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
      writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      writeFile(
        dir,
        'client/index.tsx',
        [
          "import React from 'react'",
          "import { Button, Card } from '@veltrixsecops/app-sdk/ui'",
          '',
          'function Dashboard() {',
          '  return <Card><Button>Click me</Button></Card>',
          '}',
          '',
          "export default { id: 'fictional-app', pages: { Dashboard } }",
          '',
        ].join('\n'),
      )

      const code = await getSandboxClientBundle(makeSandbox())

      expect(code).toContain('__VELTRIX_APP_RUNTIME__')
      expect(code).toMatch(/rt\.ui/)
      expect(code).not.toMatch(/from\s*["']react["']/)
      expect(code).not.toMatch(/from\s*["']@veltrixsecops\/app-sdk/)
      expect(code).toMatch(/export\s*\{/)
    },
    20000,
  )

  it(
    'caches the build while the client/ directory is unchanged',
    async () => {
      const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
      writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      writeFile(dir, 'client/index.tsx', CLIENT_INDEX_TSX)

      const first = await getSandboxClientBundle(makeSandbox())
      const second = await getSandboxClientBundle(makeSandbox())
      expect(second).toBe(first)
    },
    20000,
  )

  it(
    'invalidates the cache when a client/ file changes (edit or CLI sync)',
    async () => {
      const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
      writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      const entryPath = path.join(dir, 'client', 'index.tsx')
      writeFile(dir, 'client/index.tsx', CLIENT_INDEX_TSX)

      const first = await getSandboxClientBundle(makeSandbox())
      expect(first).toContain('hello')

      const updated = CLIENT_INDEX_TSX.replace('hello', 'goodbye')
      fs.writeFileSync(entryPath, updated)
      bumpMtime(entryPath, 5000) // guarantee a strictly newer mtime than the first build saw

      const second = await getSandboxClientBundle(makeSandbox())
      expect(second).not.toBe(first)
      expect(second).toContain('goodbye')
    },
    20000,
  )

  it(
    'caches per sandbox (customerId + sandboxId), never mixing tenants',
    async () => {
      const dir = getSandboxDir(CUSTOMER_ID, SANDBOX_ID)
      writeFile(dir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      writeFile(dir, 'client/index.tsx', CLIENT_INDEX_TSX)
      await getSandboxClientBundle(makeSandbox())

      const otherCustomer = '22222222-2222-4222-a222-222222222222'
      const otherSandboxId = '44444444-4444-4444-a444-444444444444'
      const otherDir = getSandboxDir(otherCustomer, otherSandboxId)
      writeFile(otherDir, 'manifest.yaml', baseManifestYaml('client:\n  entry: client/index\n'))
      writeFile(otherDir, 'client/index.tsx', CLIENT_INDEX_TSX.replace('hello', 'other-tenant'))

      const otherCode = await getSandboxClientBundle(
        makeSandbox({ id: otherSandboxId, customerId: otherCustomer }),
      )
      expect(otherCode).toContain('other-tenant')
    },
    20000,
  )
})

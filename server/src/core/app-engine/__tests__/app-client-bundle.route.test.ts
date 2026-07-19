// ========================================================================
// Tests: app client bundle route (GET /:appId/client.mjs)
//
// Covers:
//   - appId validation (path-traversal guard) -> 400
//   - unknown app -> 404
//   - prebuilt bundle (<appDir>/client/dist/index.mjs) served verbatim with
//     the right headers
//   - on-demand esbuild bundling of manifest client.entry with host-runtime
//     shims (no bare react import survives)
//   - app without any client bundle -> 404 JSON
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Fastify, { FastifyInstance } from 'fastify'

jest.mock('../../platform-bootstrap', () => ({
  getAppRegistry: jest.fn(),
}))
jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

import { getAppRegistry } from '../../platform-bootstrap'
import {
  registerAppClientBundleRoute,
  clearAppClientBundleCache,
  APP_ID_PATTERN,
} from '../app-client-bundle.route'

const mockGetAppRegistry = getAppRegistry as jest.Mock

// ---------------------------------------------------------------------------
// Fixture: a temp APPS_DIR with three apps
// ---------------------------------------------------------------------------

const PREBUILT_CODE = 'export default { id: "prebuilt-app", pages: {} };\n'

let appsDir: string

interface FakeLoadedApp {
  manifest: { id: string; client?: { entry?: string } }
  dir: string
}

function fakeRegistry(apps: Record<string, FakeLoadedApp>) {
  return {
    getAppsDir: () => appsDir,
    getLoadedApp: (appId: string) => apps[appId],
  }
}

async function buildServer(apps: Record<string, FakeLoadedApp>): Promise<FastifyInstance> {
  mockGetAppRegistry.mockReturnValue(fakeRegistry(apps))
  const server = Fastify()
  registerAppClientBundleRoute(server)
  await server.ready()
  return server
}

beforeAll(() => {
  appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-apps-test-'))

  // App shipping a prebuilt client bundle
  const prebuiltDist = path.join(appsDir, 'prebuilt-app', 'client', 'dist')
  fs.mkdirSync(prebuiltDist, { recursive: true })
  fs.writeFileSync(path.join(prebuiltDist, 'index.mjs'), PREBUILT_CODE)

  // App shipping client SOURCE that must be bundled on demand
  const sourceClient = path.join(appsDir, 'source-app', 'client')
  fs.mkdirSync(sourceClient, { recursive: true })
  fs.writeFileSync(
    path.join(sourceClient, 'index.tsx'),
    [
      "import React from 'react'",
      "import { useAppContext } from '@veltrixsecops/app-sdk/hooks'",
      '',
      'function HomePage() {',
      '  const ctx = useAppContext()',
      '  return <div>hello {ctx.appId}</div>',
      '}',
      '',
      "export default { id: 'source-app', pages: { HomePage } }",
      '',
    ].join('\n'),
  )

  // App shipping client SOURCE that imports @veltrixsecops/app-sdk/ui
  const uiClient = path.join(appsDir, 'ui-app', 'client')
  fs.mkdirSync(uiClient, { recursive: true })
  fs.writeFileSync(
    path.join(uiClient, 'index.tsx'),
    [
      "import React from 'react'",
      "import { Button, Card } from '@veltrixsecops/app-sdk/ui'",
      '',
      'function HomePage() {',
      '  return <Card><Button>Click me</Button></Card>',
      '}',
      '',
      "export default { id: 'ui-app', pages: { HomePage } }",
      '',
    ].join('\n'),
  )

  // App with no client bundle at all
  fs.mkdirSync(path.join(appsDir, 'server-only-app'), { recursive: true })
})

afterAll(() => {
  fs.rmSync(appsDir, { recursive: true, force: true })
})

beforeEach(() => {
  clearAppClientBundleCache()
  jest.clearAllMocks()
})

function apps(): Record<string, FakeLoadedApp> {
  return {
    'prebuilt-app': {
      manifest: { id: 'prebuilt-app' },
      dir: path.join(appsDir, 'prebuilt-app'),
    },
    'source-app': {
      manifest: { id: 'source-app', client: { entry: 'client/index.tsx' } },
      dir: path.join(appsDir, 'source-app'),
    },
    'ui-app': {
      manifest: { id: 'ui-app', client: { entry: 'client/index.tsx' } },
      dir: path.join(appsDir, 'ui-app'),
    },
    'server-only-app': {
      manifest: { id: 'server-only-app' },
      dir: path.join(appsDir, 'server-only-app'),
    },
  }
}

// ---------------------------------------------------------------------------
// appId validation
// ---------------------------------------------------------------------------

describe('APP_ID_PATTERN', () => {
  it('accepts well-formed slugs', () => {
    expect(APP_ID_PATTERN.test('splunk-cloud')).toBe(true)
    expect(APP_ID_PATTERN.test('app2')).toBe(true)
  })

  it('rejects traversal and malformed ids', () => {
    expect(APP_ID_PATTERN.test('..')).toBe(false)
    expect(APP_ID_PATTERN.test('UPPER')).toBe(false)
    expect(APP_ID_PATTERN.test('-leading')).toBe(false)
    expect(APP_ID_PATTERN.test('trailing-')).toBe(false)
    expect(APP_ID_PATTERN.test('a b')).toBe(false)
    expect(APP_ID_PATTERN.test('')).toBe(false)
  })
})

describe('GET /:appId/client.mjs', () => {
  it('returns 400 for an invalid app id before touching the registry', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/NotAValidId/client.mjs' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid app id' })
    } finally {
      await server.close()
    }
  })

  it('returns 400 for a dotted (traversal-shaped) app id', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/still..bad/client.mjs' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid app id' })
    } finally {
      await server.close()
    }
  })

  it('returns 404 for an app the registry does not know', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/ghost-app/client.mjs' })
      expect(res.statusCode).toBe(404)
      expect(res.json().error).toContain('ghost-app')
    } finally {
      await server.close()
    }
  })

  it('serves a prebuilt client/dist/index.mjs verbatim with script headers', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/prebuilt-app/client.mjs' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.payload).toBe(PREBUILT_CODE)
    } finally {
      await server.close()
    }
  })

  it(
    'bundles manifest client.entry on demand with host-runtime shims',
    async () => {
      const server = await buildServer(apps())
      try {
        const res = await server.inject({ method: 'GET', url: '/source-app/client.mjs' })
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')

        const code = res.payload
        // The shim reads the host-installed global...
        expect(code).toContain('__VELTRIX_APP_RUNTIME__')
        // ...and NO bare react / sdk import survives bundling.
        expect(code).not.toMatch(/from\s*["']react["']/)
        expect(code).not.toMatch(/require\(\s*["']react["']\s*\)/)
        expect(code).not.toMatch(/from\s*["']@veltrixsecops\/app-sdk/)
        // It is a browser ES module exposing the app's default export.
        expect(code).toMatch(/export\s*\{/)
      } finally {
        await server.close()
      }
    },
    20000,
  )

  it(
    'shims @veltrixsecops/app-sdk/ui to the host runtime global (RUNTIME_SHIM_PROPS)',
    async () => {
      const server = await buildServer(apps())
      try {
        const res = await server.inject({ method: 'GET', url: '/ui-app/client.mjs' })
        expect(res.statusCode).toBe(200)

        const code = res.payload
        // The shim reads the host-installed global's `ui` bag...
        expect(code).toContain('__VELTRIX_APP_RUNTIME__')
        expect(code).toMatch(/rt\.ui/)
        // ...and NO bare react / sdk import survives bundling (the platform's Button/Card
        // implementations — and their dependency tree — are never bundled into the app).
        expect(code).not.toMatch(/from\s*["']react["']/)
        expect(code).not.toMatch(/from\s*["']@veltrixsecops\/app-sdk/)
        expect(code).toMatch(/export\s*\{/)
      } finally {
        await server.close()
      }
    },
    20000,
  )

  it(
    'serves the cached on-demand build while sources are unchanged',
    async () => {
      const server = await buildServer(apps())
      try {
        const first = await server.inject({ method: 'GET', url: '/source-app/client.mjs' })
        const second = await server.inject({ method: 'GET', url: '/source-app/client.mjs' })
        expect(second.statusCode).toBe(200)
        expect(second.payload).toBe(first.payload)
      } finally {
        await server.close()
      }
    },
    20000,
  )

  it('returns 404 for an installed app without any client bundle', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/server-only-app/client.mjs' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'App has no client bundle' })
    } finally {
      await server.close()
    }
  })
})

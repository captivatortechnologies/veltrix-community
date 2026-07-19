// ========================================================================
// Tests: app branding routes (GET /:appId/branding/logo, /branding/logo-dark)
//
// Covers:
//   - appId validation (path-traversal guard) -> 400
//   - unknown app / app without a declared logo -> 404 JSON
//   - serving a manifest-declared SVG with the exact security headers
//   - serving the dark variant (PNG) with image/png
//   - manifest logo refs that traverse out of the app dir, use a forbidden
//     extension, or exceed the size cap are never served
//   - buildEnabledBranding: hex validation + logo URLs only for real files
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Fastify, { FastifyInstance } from 'fastify'

jest.mock('../../platform-bootstrap', () => ({
  getAppRegistry: jest.fn(),
}))

import { getAppRegistry } from '../../platform-bootstrap'
import {
  registerAppBrandingRoutes,
  buildEnabledBranding,
  resolveBrandingLogoFile,
  APP_ID_PATTERN,
  MAX_LOGO_BYTES,
} from '../app-branding.route'

const mockGetAppRegistry = getAppRegistry as jest.Mock

// ---------------------------------------------------------------------------
// Fixture: a temp APPS_DIR with branded and unbranded apps
// ---------------------------------------------------------------------------

const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#FC0000"/></svg>\n'
const LOGO_DARK_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

let appsDir: string

interface FakeLoadedApp {
  manifest: {
    id: string
    branding?: { primaryColor?: string; accentColor?: string; logo?: string; logoDark?: string }
  }
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
  registerAppBrandingRoutes(server)
  await server.ready()
  return server
}

beforeAll(() => {
  appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-branding-test-'))

  // Fully branded app: SVG logo + PNG dark variant
  const brandedAssets = path.join(appsDir, 'branded-app', 'assets')
  fs.mkdirSync(brandedAssets, { recursive: true })
  fs.writeFileSync(path.join(brandedAssets, 'logo.svg'), LOGO_SVG)
  fs.writeFileSync(path.join(brandedAssets, 'logo-dark.png'), LOGO_DARK_PNG)

  // App whose manifest points at a missing / oversized / non-image file
  const brokenDir = path.join(appsDir, 'broken-app')
  fs.mkdirSync(brokenDir, { recursive: true })
  fs.writeFileSync(path.join(brokenDir, 'huge.svg'), 'x'.repeat(MAX_LOGO_BYTES + 1))
  fs.writeFileSync(path.join(brokenDir, 'logo.js'), 'alert(1)\n')

  // A file OUTSIDE any app dir that a traversal ref would reach
  fs.writeFileSync(path.join(appsDir, 'outside.svg'), LOGO_SVG)

  // App without branding at all
  fs.mkdirSync(path.join(appsDir, 'plain-app'), { recursive: true })
})

afterAll(() => {
  fs.rmSync(appsDir, { recursive: true, force: true })
})

beforeEach(() => {
  jest.clearAllMocks()
})

function apps(): Record<string, FakeLoadedApp> {
  return {
    'branded-app': {
      manifest: {
        id: 'branded-app',
        branding: {
          primaryColor: '#FC0000',
          logo: './assets/logo.svg',
          logoDark: 'assets/logo-dark.png',
        },
      },
      dir: path.join(appsDir, 'branded-app'),
    },
    'traversal-app': {
      manifest: { id: 'traversal-app', branding: { logo: '../outside.svg' } },
      dir: path.join(appsDir, 'broken-app'),
    },
    'oversized-app': {
      manifest: { id: 'oversized-app', branding: { logo: 'huge.svg' } },
      dir: path.join(appsDir, 'broken-app'),
    },
    'badext-app': {
      manifest: { id: 'badext-app', branding: { logo: 'logo.js' } },
      dir: path.join(appsDir, 'broken-app'),
    },
    'plain-app': {
      manifest: { id: 'plain-app' },
      dir: path.join(appsDir, 'plain-app'),
    },
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

describe('GET /:appId/branding/logo', () => {
  it('returns 400 for an invalid app id before touching the registry', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/NotAValidId/branding/logo' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid app id' })
    } finally {
      await server.close()
    }
  })

  it('returns 400 for a dotted (traversal-shaped) app id', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/still..bad/branding/logo' })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid app id' })
    } finally {
      await server.close()
    }
  })

  it('returns 404 JSON for an app the registry does not know', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/ghost-app/branding/logo' })
      expect(res.statusCode).toBe(404)
      expect(res.json().error).toContain('ghost-app')
    } finally {
      await server.close()
    }
  })

  it('returns 404 JSON for an app that declares no logo', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/plain-app/branding/logo' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'App has no logo' })
    } finally {
      await server.close()
    }
  })

  it('serves the manifest-declared SVG with security headers', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/branded-app/branding/logo' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('image/svg+xml')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; style-src 'unsafe-inline'",
      )
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.payload).toBe(LOGO_SVG)
    } finally {
      await server.close()
    }
  })

  it('never serves a manifest ref that traverses out of the app dir', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/traversal-app/branding/logo' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'App has no logo' })
    } finally {
      await server.close()
    }
  })

  it('never serves an oversized logo file', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/oversized-app/branding/logo' })
      expect(res.statusCode).toBe(404)
    } finally {
      await server.close()
    }
  })

  it('never serves a non-svg/png file', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/badext-app/branding/logo' })
      expect(res.statusCode).toBe(404)
    } finally {
      await server.close()
    }
  })
})

describe('GET /:appId/branding/logo-dark', () => {
  it('serves the dark variant as image/png', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({ method: 'GET', url: '/branded-app/branding/logo-dark' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('image/png')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.rawPayload.equals(LOGO_DARK_PNG)).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('returns 404 when only the light logo is declared', async () => {
    const server = await buildServer({
      'light-only': {
        manifest: { id: 'light-only', branding: { logo: './assets/logo.svg' } },
        dir: path.join(appsDir, 'branded-app'),
      },
    })
    try {
      const res = await server.inject({ method: 'GET', url: '/light-only/branding/logo-dark' })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'App has no logo' })
    } finally {
      await server.close()
    }
  })
})

// ---------------------------------------------------------------------------
// /enabled payload mapper
// ---------------------------------------------------------------------------

describe('buildEnabledBranding', () => {
  it('passes valid hex colors through and resolves logo URLs', () => {
    const appDir = path.join(appsDir, 'branded-app')
    expect(
      buildEnabledBranding('branded-app', appDir, {
        primaryColor: '#FC0000',
        accentColor: '#0f0',
        logo: './assets/logo.svg',
        logoDark: 'assets/logo-dark.png',
      }),
    ).toEqual({
      primaryColor: '#FC0000',
      accentColor: '#0f0',
      logoUrl: '/api/apps/branded-app/branding/logo',
      logoDarkUrl: '/api/apps/branded-app/branding/logo-dark',
    })
  })

  it('drops invalid hex colors (defense in depth)', () => {
    const appDir = path.join(appsDir, 'branded-app')
    expect(
      buildEnabledBranding('branded-app', appDir, {
        primaryColor: 'red; } body { background: red',
        accentColor: '#12345',
        logo: './assets/logo.svg',
      }),
    ).toEqual({ logoUrl: '/api/apps/branded-app/branding/logo' })
  })

  it('omits logo URLs when the declared file does not exist', () => {
    const appDir = path.join(appsDir, 'plain-app')
    expect(
      buildEnabledBranding('plain-app', appDir, {
        primaryColor: '#123456',
        logo: './assets/missing.svg',
      }),
    ).toEqual({ primaryColor: '#123456' })
  })

  it('passes an https:// logo URL through verbatim (no local file needed)', () => {
    const appDir = path.join(appsDir, 'plain-app')
    expect(
      buildEnabledBranding('plain-app', appDir, {
        logo: 'https://cdn.example.com/logo.svg',
        logoDark: '  https://cdn.example.com/logo-dark.png  ',
      }),
    ).toEqual({
      logoUrl: 'https://cdn.example.com/logo.svg',
      logoDarkUrl: 'https://cdn.example.com/logo-dark.png',
    })
  })

  it('does not treat a non-https URL as a logo URL', () => {
    const appDir = path.join(appsDir, 'plain-app')
    expect(
      buildEnabledBranding('plain-app', appDir, {
        primaryColor: '#123456',
        logo: 'http://cdn.example.com/logo.svg',
      }),
    ).toEqual({ primaryColor: '#123456' })
  })

  it('returns undefined when nothing usable is declared', () => {
    const appDir = path.join(appsDir, 'plain-app')
    expect(buildEnabledBranding('plain-app', appDir, undefined)).toBeUndefined()
    expect(buildEnabledBranding('plain-app', appDir, null)).toBeUndefined()
    expect(
      buildEnabledBranding('plain-app', appDir, { primaryColor: 'not-a-color' }),
    ).toBeUndefined()
  })
})

describe('resolveBrandingLogoFile', () => {
  it('rejects traversal, wrong extensions, oversized and missing files', () => {
    const brokenDir = path.join(appsDir, 'broken-app')
    expect(resolveBrandingLogoFile(brokenDir, '../outside.svg')).toBeNull()
    expect(resolveBrandingLogoFile(brokenDir, 'logo.js')).toBeNull()
    expect(resolveBrandingLogoFile(brokenDir, 'huge.svg')).toBeNull()
    expect(resolveBrandingLogoFile(brokenDir, 'missing.svg')).toBeNull()
    expect(resolveBrandingLogoFile(brokenDir, undefined)).toBeNull()
    expect(resolveBrandingLogoFile(brokenDir, '')).toBeNull()
  })

  it('resolves a well-formed in-dir svg', () => {
    const brandedDir = path.join(appsDir, 'branded-app')
    expect(resolveBrandingLogoFile(brandedDir, './assets/logo.svg')).toBe(
      path.join(brandedDir, 'assets', 'logo.svg'),
    )
  })
})

describe('APP_ID_PATTERN', () => {
  it('accepts slugs and rejects traversal shapes', () => {
    expect(APP_ID_PATTERN.test('crowdstrike-edr')).toBe(true)
    expect(APP_ID_PATTERN.test('..')).toBe(false)
    expect(APP_ID_PATTERN.test('UPPER')).toBe(false)
  })
})

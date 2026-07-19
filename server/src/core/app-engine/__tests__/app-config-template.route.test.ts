// ========================================================================
// Tests: app config-template routes
//   GET /:appId/config-types/:configTypeId/canvas
//   GET /:appId/config-types/:configTypeId/defaults
//
// Boots a real Fastify instance with the routes and a mocked auth middleware /
// registry. Covers:
//   - valid -> 200 with parsed sections/fields intact (fieldType + options
//     survive the schema-less send)
//   - bad appId slug -> 400
//   - unknown app -> 404
//   - unknown configTypeId -> 404
//   - path-traversal in a manifest canvasTemplate -> 400
//   - /defaults with no declared defaultConfig -> 200 {}
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import Fastify, { FastifyInstance } from 'fastify'

jest.mock('../../platform-bootstrap', () => ({
  getAppRegistry: jest.fn(),
}))
// R3 (RBAC/IdP hardening 2026-07-10): routes are now also gated by
// hasAppPermission(appId, configTypeId, 'read'). The default test user here
// is a platform admin (bypasses every check) so every PRE-EXISTING test in
// this file keeps exercising exactly the handler behavior it always did; a
// dedicated describe block below covers the permission gate itself with a
// non-admin user.
jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: jest.fn(async (request: { user?: unknown }) => {
      request.user = (global as any).__TEST_USER__ ?? {
        id: 'user-1',
        customerId: 'cust-1',
        roleId: 'role-admin',
      }
    }),
  }
})
jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    app: { findUnique: jest.fn() },
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
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
import { registerAppConfigTemplateRoutes, APP_ID_PATTERN } from '../app-config-template.route'
import prisma from '../../../db'
import { PLATFORM_ADMIN_ROLE } from '../../../lib/platform-authz'

const mockGetAppRegistry = getAppRegistry as jest.Mock
const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockAppFindUnique = prisma.app.findUnique as jest.Mock

/** The fake `App.id` (UUID) "demo-app" resolves to — Permission.appId's real identity. */
const DEMO_APP_UUID = 'app-uuid-demo-app'

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

// ---------------------------------------------------------------------------
// Fixture: a temp APPS_DIR with one app declaring a config type whose
// canvasTemplate + defaultConfig point at real files on disk.
// ---------------------------------------------------------------------------

const CANVAS_YAML = [
  'id: index',
  'name: Index',
  'description: Configure a Splunk index',
  'sections:',
  '  - name: General',
  '    icon: settings',
  '    description: Basic settings',
  '    fields:',
  '      - key: name',
  '        label: Index Name',
  '        fieldType: text',
  '        required: true',
  '        placeholder: my_index',
  '      - key: retention',
  '        label: Retention',
  '        fieldType: select',
  '        required: false',
  '        defaultValue: 90d',
  '        options:',
  '          - label: 30 days',
  '            value: 30d',
  '          - label: 90 days',
  '            value: 90d',
  '',
].join('\n')

const DEFAULTS_YAML = ['name: default_index', 'retention: 90d', ''].join('\n')

interface ConfigTypeManifest {
  id: string
  name: string
  canvasTemplate: string
  defaultConfig?: string
}

interface FakeLoadedApp {
  manifest: {
    id: string
    pipeline: { configurationTypes: ConfigTypeManifest[] }
  }
  dir: string
}

let appsDir: string

function fakeRegistry(apps: Record<string, FakeLoadedApp>) {
  return {
    getAppsDir: () => appsDir,
    getLoadedApp: (appId: string) => apps[appId],
  }
}

async function buildServer(apps: Record<string, FakeLoadedApp>): Promise<FastifyInstance> {
  mockGetAppRegistry.mockReturnValue(fakeRegistry(apps))
  const server = Fastify()
  registerAppConfigTemplateRoutes(server)
  await server.ready()
  return server
}

beforeAll(() => {
  appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-cfg-tpl-test-'))

  // App "demo-app" with a config type "index" whose canvas.yaml + defaults.yaml
  // live under config-types/index/.
  const ctDir = path.join(appsDir, 'demo-app', 'config-types', 'index')
  fs.mkdirSync(ctDir, { recursive: true })
  fs.writeFileSync(path.join(ctDir, 'canvas.yaml'), CANVAS_YAML)
  fs.writeFileSync(path.join(appsDir, 'demo-app', 'config-types', 'index', 'defaults.yaml'), DEFAULTS_YAML)
})

afterAll(() => {
  fs.rmSync(appsDir, { recursive: true, force: true })
})

beforeEach(() => {
  jest.clearAllMocks()
  setTestUser(undefined) // falls back to the default platform-admin user
  mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: PLATFORM_ADMIN_ROLE })
  // ensureConfigTypeReadPermission resolves the URL's app SLUG to App.id (a UUID) before
  // checking — Permission.appId is a foreign key to that id, never the slug.
  mockAppFindUnique.mockResolvedValue({ id: DEMO_APP_UUID })
})

function apps(): Record<string, FakeLoadedApp> {
  return {
    'demo-app': {
      manifest: {
        id: 'demo-app',
        pipeline: {
          configurationTypes: [
            {
              id: 'index',
              name: 'Index',
              canvasTemplate: 'config-types/index/canvas.yaml',
              defaultConfig: 'config-types/index/defaults.yaml',
            },
            // A config type declaring NO defaultConfig, and a canvasTemplate
            // that escapes the app dir (traversal fixture).
            {
              id: 'evil',
              name: 'Evil',
              canvasTemplate: '../../etc/x',
            },
            // A config type with a canvasTemplate but no defaultConfig.
            {
              id: 'no-defaults',
              name: 'No Defaults',
              canvasTemplate: 'config-types/index/canvas.yaml',
            },
          ],
        },
      },
      dir: path.join(appsDir, 'demo-app'),
    },
  }
}

describe('APP_ID_PATTERN', () => {
  it('accepts well-formed slugs and rejects traversal-shaped ids', () => {
    expect(APP_ID_PATTERN.test('demo-app')).toBe(true)
    expect(APP_ID_PATTERN.test('..')).toBe(false)
    expect(APP_ID_PATTERN.test('UPPER')).toBe(false)
  })
})

describe('GET /:appId/config-types/:configTypeId/canvas', () => {
  it('returns 200 with parsed sections and fields intact', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-cache')

      const body = res.json()
      expect(body.id).toBe('index')
      expect(Array.isArray(body.sections)).toBe(true)
      expect(body.sections).toHaveLength(1)

      const fields = body.sections[0].fields
      expect(fields).toHaveLength(2)
      // fieldType is preserved verbatim (not transformed to `type`).
      expect(fields[0].fieldType).toBe('text')
      expect(fields[0].key).toBe('name')
      expect(fields[0].required).toBe(true)

      // Nested `options` array survives the schema-less send intact.
      expect(fields[1].fieldType).toBe('select')
      expect(fields[1].options).toEqual([
        { label: '30 days', value: '30d' },
        { label: '90 days', value: '90d' },
      ])
      expect(fields[1].defaultValue).toBe('90d')
    } finally {
      await server.close()
    }
  })

  it('returns 400 for an invalid app id before touching the registry', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/NotAValidId/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid app id' })
    } finally {
      await server.close()
    }
  })

  it('returns 404 for an app the registry does not know', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/ghost-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'App not found' })
    } finally {
      await server.close()
    }
  })

  it('returns 404 for an unknown config type id', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/does-not-exist/canvas',
      })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'Configuration type not found' })
    } finally {
      await server.close()
    }
  })

  it('returns 400 when a manifest canvasTemplate escapes the app dir', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/evil/canvas',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid template path' })
    } finally {
      await server.close()
    }
  })
})

describe('GET /:appId/config-types/:configTypeId/defaults', () => {
  it('returns 200 with the parsed defaults', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/defaults',
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.json()).toEqual({ name: 'default_index', retention: '90d' })
    } finally {
      await server.close()
    }
  })

  it('returns 200 {} when the config type declares no defaultConfig', async () => {
    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/no-defaults/defaults',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({})
    } finally {
      await server.close()
    }
  })
})

// ---------------------------------------------------------------------------
// R3 (RBAC/IdP hardening 2026-07-10): hasAppPermission(appId, configTypeId,
// 'read') gate — config types use resource = configTypeId (design decision 1).
// ---------------------------------------------------------------------------

describe('permission gating (R3)', () => {
  it('403s a non-admin user who does not hold the config-type permission', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-nobody' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-nobody', name: 'RegularUser' })
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([])

    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('allows a non-admin user holding the exact app-scoped config-type permission', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-viewer' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-viewer', name: 'IndexViewer' })
    // Permission.appId is App.id (a UUID, FK-enforced) — NOT the "demo-app" URL slug. A
    // role grant made through the real role API is always keyed by that id (resolved from
    // the slug by the route itself before this check runs).
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'p1', resource: 'index', action: 'read', roleId: 'role-viewer', appId: DEMO_APP_UUID },
    ])

    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('403s a non-admin user holding the permission for a DIFFERENT config type', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-viewer' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-viewer', name: 'IndexViewer' })
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'p1', resource: 'no-defaults', action: 'read', roleId: 'role-viewer', appId: DEMO_APP_UUID },
    ])

    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('403s a grant keyed by the manifest SLUG instead of App.id — proves the slug/UUID mismatch is fixed', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-viewer' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-viewer', name: 'IndexViewer' })
    // A row that (incorrectly) used the slug as appId — this is what Permission.appId
    // could never actually contain in production (the column is a foreign key to
    // App.id), but exercising it here pins down that the route resolves and compares
    // against the REAL App.id, not whatever string happens to be in the URL.
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'p1', resource: 'index', action: 'read', roleId: 'role-viewer', appId: 'demo-app' },
    ])

    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await server.close()
    }
  })

  it('falls back to platform-only matching (still fail-closed) when the app slug has no App row yet', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-viewer' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-viewer', name: 'IndexViewer' })
    mockAppFindUnique.mockResolvedValue(null)
    // A PLATFORM-scoped grant (appId: null) for the same resource/action still satisfies
    // an app-scoped check (decision 2), even with no resolved App.id.
    ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'p1', resource: 'index', action: 'read', roleId: 'role-viewer', appId: null },
    ])

    const server = await buildServer(apps())
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/demo-app/config-types/index/canvas',
      })
      expect(res.statusCode).toBe(200)
    } finally {
      await server.close()
    }
  })
})

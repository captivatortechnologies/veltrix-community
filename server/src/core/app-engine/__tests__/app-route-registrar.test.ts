// ========================================================================
// Tests: app-route-registrar — R3 (RBAC/IdP hardening 2026-07-10) auto-gate.
//
// A route that declares `config: { requiresAppPermission }` must be
// enforced by the registrar itself (hasAppPermission), even if the app's
// own handler never calls ctx.hasPermission inline. A route with no such
// declaration keeps working exactly as before (verifyToken + app-enabled
// only).
// ========================================================================

import Fastify from 'fastify'
import { registerAppRoutes } from '../app-route-registrar'
import prisma from '../../../db'
import type { AppManifest } from '../../../../../shared/types/app'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    app: { findUnique: jest.fn() },
    appInstallation: { findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: async (req: any) => {
      req.user = (global as any).__TEST_USER__
    },
  }
})

const mockAppFindUnique = prisma.app.findUnique as jest.Mock
const mockAppInstallationFindFirst = prisma.appInstallation.findFirst as jest.Mock
const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

const APP_ID = 'splunk-enterprise'
/** The fake `App.id` (UUID) the "splunk-enterprise" slug resolves to. */
const APP_UUID = 'app-uuid-splunk-enterprise'

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

const manifest = { id: APP_ID, server: { routes: { prefix: `/api/apps/${APP_ID}` } } } as unknown as AppManifest

describe('app-route-registrar — declarative auto-gate (R3)', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    jest.clearAllMocks()
    app = Fastify()

    // registerAppRoutes resolves the manifest's app SLUG to its App.id (a UUID) ONCE at
    // registration time — Permission.appId is a foreign key to that id, never the slug.
    mockAppFindUnique.mockResolvedValue({ id: APP_UUID })

    const serverModule = {
      default: async (fastify: any) => {
        // A route that DECLARES a permission requirement via config — no
        // inline ctx.hasPermission call. The registrar must still enforce it.
        fastify.get('/indexes', {
          config: { requiresAppPermission: { resource: 'indexes', action: 'read' } },
          handler: async (_req: any, reply: any) => reply.send({ ok: true, route: 'indexes' }),
        })

        // A route with NO declared requirement — only auth + app-enabled apply.
        fastify.get('/public-info', {
          handler: async (_req: any, reply: any) => reply.send({ ok: true, route: 'public-info' }),
        })

        // Multiple requirements (AND semantics).
        fastify.post('/indexes/deploy', {
          config: {
            requiresAppPermission: [
              { resource: 'indexes', action: 'read' },
              { resource: 'indexes', action: 'write' },
            ],
          },
          handler: async (_req: any, reply: any) => reply.send({ ok: true, route: 'deploy' }),
        })
      },
    }

    await registerAppRoutes(app, manifest, '/tmp/apps/splunk-enterprise', serverModule)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('403s a declaratively-gated route for a user without the declared app permission', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' }) // app enabled
    mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })
    mockQueryRaw.mockResolvedValue([]) // no permissions at all

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(403)
  })

  it('allows a declaratively-gated route for a user holding the app-scoped permission', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })
    // Permission.appId is App.id (a UUID, FK-enforced) — NOT the "splunk-enterprise" slug.
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: APP_UUID },
    ])

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(200)
  })

  it('403s a grant keyed by the manifest SLUG instead of App.id — proves the slug/UUID mismatch is fixed', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: APP_ID },
    ])

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(403)
  })

  it('a platform-scoped grant of the same resource/action also satisfies the app-scoped gate (decision 2)', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: null },
    ])

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(200)
  })

  it('enforces ALL requirements in an array declaration (AND semantics)', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })
    // Holds read but NOT write — the write requirement must still 403.
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: APP_UUID },
    ])

    const res = await app.inject({ method: 'POST', url: `/api/apps/${APP_ID}/indexes/deploy` })
    expect(res.statusCode).toBe(403)
  })

  it('leaves an UNDECLARED route gated only by auth + app-enabled (unchanged behavior)', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/public-info` })
    expect(res.statusCode).toBe(200)
    // No permission lookup at all for an undeclared route.
    expect(mockRoleFindUnique).not.toHaveBeenCalled()
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })

  it('403s (app not enabled) before permission gating is even reached', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockAppInstallationFindFirst.mockResolvedValue(null) // not enabled

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(403)
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })

  it('401s when unauthenticated, before app-enabled or permission checks', async () => {
    setTestUser(undefined)

    const res = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
    expect(res.statusCode).toBe(401)
    expect(mockAppInstallationFindFirst).not.toHaveBeenCalled()
  })
})

describe('app-route-registrar — App.id resolution fallback', () => {
  it('falls back to platform-only matching (still fail-closed) when the app slug has no App row yet', async () => {
    jest.clearAllMocks()
    mockAppFindUnique.mockResolvedValue(null) // App row not registered yet at boot time

    const app = Fastify()
    const serverModule = {
      default: async (fastify: any) => {
        fastify.get('/indexes', {
          config: { requiresAppPermission: { resource: 'indexes', action: 'read' } },
          handler: async (_req: any, reply: any) => reply.send({ ok: true }),
        })
      },
    }
    await registerAppRoutes(app, manifest, '/tmp/apps/splunk-enterprise', serverModule)
    await app.ready()

    try {
      setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
      mockAppInstallationFindFirst.mockResolvedValue({ id: 'inst-1' })
      mockRoleFindUnique.mockResolvedValue({ id: 'role-1', name: 'User' })

      // An app-scoped-only grant can never match (no resolved App.id to compare against).
      mockQueryRaw.mockResolvedValue([
        { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: APP_UUID },
      ])
      const denied = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
      expect(denied.statusCode).toBe(403)

      // A PLATFORM-scoped grant of the same resource/action still satisfies it (decision 2).
      mockQueryRaw.mockResolvedValue([
        { id: 'p2', resource: 'indexes', action: 'read', roleId: 'role-1', appId: null },
      ])
      const allowed = await app.inject({ method: 'GET', url: `/api/apps/${APP_ID}/indexes` })
      expect(allowed.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
})

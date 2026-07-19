// ========================================================================
// Tests: configuration-canvas.auth — URGENT security fix (2026-07-11).
//
// Every single-record canvas route used to be gated ONLY by the flat
// platform configuration-canvas:read/write permission, with no way to
// scope a role down to a single tool's canvases. These guards resolve the
// canvas's toolType to a real installed App.id (best-effort — this legacy
// subsystem predates the App platform, so usually resolves to null) and
// route the check through hasAppPermission instead of a plain hasPermission
// call, WITHOUT regressing any existing role's broad grant (checkPermission's
// platform-wildcard rule covers that automatically).
// ========================================================================

import Fastify, { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '../../../db'
import {
  resolveAppIdForToolType,
  ensureCanvasPermission,
  ensureCanvasCreatePermission,
} from '../configuration-canvas.auth'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    app: { findFirst: jest.fn() },
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    configurationCanvas: { findFirst: jest.fn() },
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockAppFindFirst = prisma.app.findFirst as jest.Mock
const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock
const mockCanvasFindFirst = prisma.configurationCanvas.findFirst as jest.Mock

const OWN_CUSTOMER = 'cust-1'
const CANVAS_ID = '00000000-0000-0000-0000-0000000000c1'
const CROWDSTRIKE_APP_UUID = 'app-uuid-crowdstrike'

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

// Stand-in for verifyToken (already covered by its own tests elsewhere) —
// just attaches request.user the way the real middleware would.
const attachTestUser = async (request: FastifyRequest) => {
  request.user = (global as any).__TEST_USER__
}

describe('resolveAppIdForToolType', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null for an empty toolType without querying the DB', async () => {
    const result = await resolveAppIdForToolType('')
    expect(result).toBeNull()
    expect(mockAppFindFirst).not.toHaveBeenCalled()
  })

  it('returns null when no installed app matches the toolType (the common case for this legacy subsystem)', async () => {
    mockAppFindFirst.mockResolvedValue(null)
    const result = await resolveAppIdForToolType('SPLUNK_ENTERPRISE')
    expect(result).toBeNull()
  })

  it('resolves a case-insensitive match to the real App.id UUID when an installed app slug matches', async () => {
    mockAppFindFirst.mockResolvedValue({ id: CROWDSTRIKE_APP_UUID })
    const result = await resolveAppIdForToolType('CROWDSTRIKE-EDR')
    expect(result).toBe(CROWDSTRIKE_APP_UUID)
    expect(mockAppFindFirst).toHaveBeenCalledWith({
      where: { appId: { equals: 'CROWDSTRIKE-EDR', mode: 'insensitive' } },
      select: { id: true },
    })
  })
})

describe('ensureCanvasPermission', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.get(
      '/canvas/:id',
      { preHandler: [attachTestUser, ensureCanvasPermission('read')] },
      async (_req: FastifyRequest, reply: FastifyReply) => reply.send({ ok: true })
    )
    app.put(
      '/canvas/:id',
      { preHandler: [attachTestUser, ensureCanvasPermission('write')] },
      async (_req: FastifyRequest, reply: FastifyReply) => reply.send({ ok: true })
    )
    await app.ready()
  })

  afterAll(async () => await app.close())

  beforeEach(() => {
    jest.clearAllMocks()
    mockAppFindFirst.mockResolvedValue(null)
  })

  it('401s when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({ method: 'GET', url: `/canvas/${CANVAS_ID}` })
    expect(res.statusCode).toBe(401)
    expect(mockCanvasFindFirst).not.toHaveBeenCalled()
  })

  it('404s for a canvas that does not exist in the caller\'s own tenant (never leaks cross-tenant existence)', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-1' })
    mockCanvasFindFirst.mockResolvedValue(null)

    const res = await app.inject({ method: 'GET', url: `/canvas/${CANVAS_ID}` })
    expect(res.statusCode).toBe(404)
    expect(mockCanvasFindFirst).toHaveBeenCalledWith({
      where: { id: CANVAS_ID, customerId: OWN_CUSTOMER },
      select: { toolType: true },
    })
  })

  it('403s a role with NO configuration-canvas permission at all', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-no-perms' })
    mockCanvasFindFirst.mockResolvedValue({ toolType: 'SPLUNK_ENTERPRISE' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])

    const res = await app.inject({ method: 'PUT', url: `/canvas/${CANVAS_ID}`, payload: {} })
    expect(res.statusCode).toBe(403)
  })

  it('NO REGRESSION: an existing role\'s broad platform configuration-canvas:write grant still works, even though the toolType resolves to no installed app', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-broad' })
    mockCanvasFindFirst.mockResolvedValue({ toolType: 'SPLUNK_ENTERPRISE' })
    mockAppFindFirst.mockResolvedValue(null) // no installed app named 'SPLUNK_ENTERPRISE'
    mockRoleFindUnique.mockResolvedValue({ id: 'role-broad', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'configuration-canvas', action: 'write', roleId: 'role-broad', appId: null },
    ])

    const res = await app.inject({ method: 'PUT', url: `/canvas/${CANVAS_ID}`, payload: {} })
    expect(res.statusCode).toBe(200)
  })

  it('a role scoped to a DIFFERENT app\'s configuration-canvas grant is 403d on a canvas whose toolType resolves to another app', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-scoped' })
    mockCanvasFindFirst.mockResolvedValue({ toolType: 'SPLUNK_ENTERPRISE' })
    mockAppFindFirst.mockResolvedValue({ id: 'app-uuid-splunk' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-scoped', name: 'RegularUser' })
    // Grant is scoped to CrowdStrike's app id — this canvas resolves to Splunk's.
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'configuration-canvas', action: 'write', roleId: 'role-scoped', appId: CROWDSTRIKE_APP_UUID },
    ])

    const res = await app.inject({ method: 'PUT', url: `/canvas/${CANVAS_ID}`, payload: {} })
    expect(res.statusCode).toBe(403)
  })

  it('THE TIGHTENING: a role scoped to the SAME resolved app is allowed', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-scoped' })
    mockCanvasFindFirst.mockResolvedValue({ toolType: 'CROWDSTRIKE-EDR' })
    mockAppFindFirst.mockResolvedValue({ id: CROWDSTRIKE_APP_UUID })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-scoped', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'configuration-canvas', action: 'write', roleId: 'role-scoped', appId: CROWDSTRIKE_APP_UUID },
    ])

    const res = await app.inject({ method: 'PUT', url: `/canvas/${CANVAS_ID}`, payload: {} })
    expect(res.statusCode).toBe(200)
  })
})

describe('ensureCanvasCreatePermission', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.post(
      '/canvas',
      { preHandler: [attachTestUser, ensureCanvasCreatePermission] },
      async (_req: FastifyRequest, reply: FastifyReply) => reply.send({ ok: true })
    )
    await app.ready()
  })

  afterAll(async () => await app.close())

  beforeEach(() => {
    jest.clearAllMocks()
    mockAppFindFirst.mockResolvedValue(null)
  })

  it('401s when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({ method: 'POST', url: '/canvas', payload: { toolType: 'SPLUNK_ENTERPRISE' } })
    expect(res.statusCode).toBe(401)
  })

  it('403s a role without configuration-canvas:write', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-no-perms' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])

    const res = await app.inject({ method: 'POST', url: '/canvas', payload: { toolType: 'SPLUNK_ENTERPRISE' } })
    expect(res.statusCode).toBe(403)
  })

  it('allows an existing broad platform grant with no DB lookup for a canvas row (none exists yet)', async () => {
    setTestUser({ id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-broad' })
    mockRoleFindUnique.mockResolvedValue({ id: 'role-broad', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'configuration-canvas', action: 'write', roleId: 'role-broad', appId: null },
    ])

    const res = await app.inject({ method: 'POST', url: '/canvas', payload: { toolType: 'SPLUNK_ENTERPRISE' } })
    expect(res.statusCode).toBe(200)
    expect(mockCanvasFindFirst).not.toHaveBeenCalled()
  })
})

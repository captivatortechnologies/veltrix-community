// ========================================================================
// WebSocket Server Tests (handshake auth + cross-tenant isolation)
//
// Covers the S6.1 realtime foundation fixes:
//   - handshake derives the tenant from the JWT `customerId` claim (there is
//     no tenantId claim) and REJECTS any socket that resolves to no customer
//     (never joins an `undefined` room)
//   - API-key sockets authenticate with the sandbox:read scope; keys without
//     it are rejected
//   - a customer's socket only ever receives its OWN tenant room's events
//     (customer A never sees customer B's broadcast) — the latent
//     cross-tenant broadcast leak this fix closes
//
// `authenticateSocketToken` is unit-tested directly, then a real Socket.IO
// server + socket.io-client round-trip proves the room isolation end to end.
// ========================================================================

import * as http from 'http'
import { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import {
  WebSocketServer,
  authenticateSocketToken,
} from '../websocket-server'

// The api-key module is mocked so key resolution never touches the DB.
jest.mock('../../module/api-key/api-key.service', () => ({
  apiKeyService: { getApiKeyDetails: jest.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiKeyService } = jest.requireMock('../../module/api-key/api-key.service') as {
  apiKeyService: { getApiKeyDetails: jest.Mock }
}

const TEST_SECRET = 'test-jwt-secret-for-ws'
const CUSTOMER_A = '11111111-1111-4111-a111-111111111111'
const CUSTOMER_B = '22222222-2222-4222-a222-222222222222'

function jwtFor(claims: Record<string, unknown>): string {
  return jwt.sign(claims, TEST_SECRET)
}

// ---------------------------------------------------------------------------
// authenticateSocketToken (pure resolver)
// ---------------------------------------------------------------------------

describe('authenticateSocketToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    apiKeyService.getApiKeyDetails.mockResolvedValue(null)
  })

  it('resolves a portal JWT to its customer (tenant == customer, no tenantId claim)', async () => {
    const token = jwtFor({ userId: 'user-1', customerId: CUSTOMER_A, roleId: 'role-1' })
    const principal = await authenticateSocketToken(token, TEST_SECRET)
    expect(principal).toEqual({
      customerId: CUSTOMER_A,
      userId: 'user-1',
      principalType: 'jwt',
      scopes: [],
    })
  })

  it('rejects a validly-signed JWT that carries no customer (no undefined room)', async () => {
    const token = jwtFor({ userId: 'user-1', roleId: 'role-1' }) // no customerId
    expect(await authenticateSocketToken(token, TEST_SECRET)).toBeNull()
  })

  it('rejects a missing/empty token', async () => {
    expect(await authenticateSocketToken(undefined, TEST_SECRET)).toBeNull()
    expect(await authenticateSocketToken('', TEST_SECRET)).toBeNull()
  })

  it('accepts an API key holding sandbox:read and resolves its customer', async () => {
    apiKeyService.getApiKeyDetails.mockResolvedValue({
      customerId: CUSTOMER_B,
      type: 'api',
      scopes: ['sandbox:read'],
      ownership: 'tenant',
    })
    const principal = await authenticateSocketToken('vltx_apikey_value', TEST_SECRET)
    expect(principal).toMatchObject({ customerId: CUSTOMER_B, principalType: 'apikey' })
  })

  it('accepts an API key holding sandbox:write (write implies read)', async () => {
    apiKeyService.getApiKeyDetails.mockResolvedValue({
      customerId: CUSTOMER_B,
      type: 'api',
      scopes: ['sandbox:write'],
      ownership: 'tenant',
    })
    const principal = await authenticateSocketToken('vltx_apikey_value', TEST_SECRET)
    expect(principal).toMatchObject({ customerId: CUSTOMER_B, principalType: 'apikey' })
  })

  it('rejects an API key without the sandbox:read/write scope', async () => {
    apiKeyService.getApiKeyDetails.mockResolvedValue({
      customerId: CUSTOMER_B,
      type: 'api',
      scopes: ['apps:read'],
      ownership: 'tenant',
    })
    expect(await authenticateSocketToken('vltx_apikey_value', TEST_SECRET)).toBeNull()
  })

  it('rejects a garbage token that is neither a valid JWT nor a known API key', async () => {
    apiKeyService.getApiKeyDetails.mockResolvedValue(null)
    expect(await authenticateSocketToken('not-a-real-token', TEST_SECRET)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Real Socket.IO round-trip: room isolation + handshake rejection
// ---------------------------------------------------------------------------

describe('WebSocketServer handshake + cross-tenant isolation (round-trip)', () => {
  let httpServer: http.Server
  let wsServer: WebSocketServer
  let port: number
  const clients: ClientSocket[] = []

  beforeAll((done) => {
    httpServer = http.createServer()
    wsServer = new WebSocketServer(httpServer, null, TEST_SECRET)
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port
      done()
    })
  })

  afterAll(async () => {
    for (const c of clients) c.disconnect()
    wsServer.getIO().close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  beforeEach(() => {
    apiKeyService.getApiKeyDetails.mockReset()
    apiKeyService.getApiKeyDetails.mockResolvedValue(null)
  })

  function connect(token: string | undefined): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${port}`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      })
      clients.push(socket)
      socket.on('connect', () => resolve(socket))
      socket.on('connect_error', (err) => reject(err))
    })
  }

  it('rejects a socket with no token', async () => {
    await expect(connect(undefined)).rejects.toThrow(/Authentication token required/)
  })

  it('rejects a socket whose credential resolves to no customer', async () => {
    const token = jwtFor({ userId: 'user-x', roleId: 'role-x' }) // no customerId
    await expect(connect(token)).rejects.toThrow(/Authentication failed/)
  })

  it('accepts an API-key socket with sandbox:read, rejects one without', async () => {
    apiKeyService.getApiKeyDetails.mockImplementation(async (key: string) =>
      key === 'good-key'
        ? { customerId: CUSTOMER_A, type: 'api', scopes: ['sandbox:read'], ownership: 'tenant' }
        : { customerId: CUSTOMER_A, type: 'api', scopes: [], ownership: 'tenant' },
    )

    const accepted = await connect('good-key')
    expect(accepted.connected).toBe(true)

    await expect(connect('no-scope-key')).rejects.toThrow(/Authentication failed/)
  })

  it('never delivers customer B a customer A broadcast (cross-tenant isolation)', async () => {
    const socketA = await connect(jwtFor({ userId: 'user-a', customerId: CUSTOMER_A, roleId: 'r' }))
    const socketB = await connect(jwtFor({ userId: 'user-b', customerId: CUSTOMER_B, roleId: 'r' }))

    const receivedByA: unknown[] = []
    const receivedByB: unknown[] = []
    socketA.on('sandbox:file-changed', (p) => receivedByA.push(p))
    socketB.on('sandbox:file-changed', (p) => receivedByB.push(p))

    // Give both sockets a moment to finish joining their tenant rooms.
    await new Promise((r) => setTimeout(r, 100))

    // Broadcast into customer A's room only.
    wsServer.emitToTenant(CUSTOMER_A, 'sandbox:file-changed', {
      sandboxId: 'sb-1',
      path: 'config-types/indexes/validate.ts',
    })

    // Wait long enough that a leaked delivery would have arrived.
    await new Promise((r) => setTimeout(r, 250))

    expect(receivedByA).toHaveLength(1)
    expect(receivedByB).toHaveLength(0) // the fix: B is never in A's room
  })

  it('tracks a connected JWT user under its own customer', async () => {
    await connect(jwtFor({ userId: 'user-c', customerId: CUSTOMER_A, roleId: 'r' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(wsServer.getTenantUsers(CUSTOMER_A)).toContain('user-c')
    expect(wsServer.getTenantUsers(CUSTOMER_B)).not.toContain('user-c')
  })
})

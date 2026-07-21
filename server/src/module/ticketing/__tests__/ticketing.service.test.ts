// ========================================================================
// Tests: ticketing service (module/ticketing/ticketing.service.ts)
//
// Focus: the security-relevant behaviour —
//   - secrets are MASKED on read (never returned in the clear);
//   - create validates via the adapter + encrypts config + honors isDefault;
//   - testConnection persists the probe result;
//   - resolveConnectionRow falls back to the tenant's default connection.
// Every op is customer-scoped (each tenant manages its own ticketing).
// ========================================================================

import { ticketingService } from '../ticketing.service'
import prisma from '../../../db'

// Encryption is exercised elsewhere — here we pass config through unchanged so
// the test asserts the service's masking, not the cipher.
jest.mock('../../../utils/encryption', () => ({
  encryptFields: (obj: Record<string, unknown>) => obj,
  decryptFields: (obj: Record<string, unknown>) => obj,
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('../../credential/credential.service', () => ({
  decryptCredentialSecrets: (c: unknown) => c,
}))

// A mutable adapter the registry mock returns.
const mockAdapter = {
  provider: 'servicenow',
  ticketTypes: ['change'],
  validateConfig: jest.fn(() => ({ valid: true, errors: [] as string[] })),
  testConnection: jest.fn(async () => ({ success: true, message: 'Connected', latencyMs: 12 })),
  createTicket: jest.fn(),
  getTicket: jest.fn(),
  searchTickets: jest.fn(),
  addComment: jest.fn(),
}
jest.mock('../adapters', () => ({ getTicketProvider: () => mockAdapter }))

jest.mock('../../../db', () => {
  const model = () => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  })
  const db: any = {
    ticketingConnection: model(),
    configurationTicketLink: model(),
    configurationCanvas: model(),
    credential: model(),
  }
  db.$transaction = jest.fn((cb: any) => cb(db))
  return { __esModule: true, default: db }
})

const db = prisma as unknown as {
  ticketingConnection: Record<string, jest.Mock>
  configurationTicketLink: Record<string, jest.Mock>
  configurationCanvas: Record<string, jest.Mock>
  credential: Record<string, jest.Mock>
  $transaction: jest.Mock
}

const CUSTOMER = 'cust-1'

function snowRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tc-1',
    customerId: CUSTOMER,
    provider: 'servicenow',
    name: 'Prod ServiceNow',
    instanceUrl: 'https://acme.service-now.com',
    credentialId: null,
    isDefault: true,
    isEnabled: true,
    config: { authMethod: 'basic', username: 'admin', password: 'supersecret' },
    status: 'CONNECTED',
    statusMessage: null,
    lastTestedAt: null,
    createdAt: new Date('2026-07-21T00:00:00Z'),
    updatedAt: new Date('2026-07-21T00:00:00Z'),
    ...over,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('ticketingService — secrets never leave the server', () => {
  it('masks the password on read (list) and leaves non-secret fields intact', async () => {
    db.ticketingConnection.findMany.mockResolvedValue([snowRow()])

    const [dto] = await ticketingService.listConnections(CUSTOMER)

    expect((dto.config as Record<string, unknown>).username).toBe('admin')
    expect((dto.config as Record<string, unknown>).password).toBe('••••••cret') // masked, last 4
    expect(db.ticketingConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER } }),
    )
  })

  it('createConnection validates + encrypts + clears prior default, and returns a masked DTO', async () => {
    db.ticketingConnection.create.mockResolvedValue(snowRow())

    const dto = await ticketingService.createConnection(CUSTOMER, {
      provider: 'servicenow',
      name: 'Prod ServiceNow',
      instanceUrl: 'https://acme.service-now.com',
      config: { authMethod: 'basic', username: 'admin', password: 'supersecret' },
      isDefault: true,
    } as never)

    expect(mockAdapter.validateConfig).toHaveBeenCalled()
    // isDefault=true clears any other default in the same tenant.
    expect(db.ticketingConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER, isDefault: true } }),
    )
    expect((dto.config as Record<string, unknown>).password).toBe('••••••cret')
  })

  it('rejects an invalid provider before touching the DB', async () => {
    await expect(
      ticketingService.createConnection(CUSTOMER, { provider: 'jira', name: 'x', instanceUrl: 'y', config: {} } as never),
    ).rejects.toThrow(/Invalid provider/)
    expect(db.ticketingConnection.create).not.toHaveBeenCalled()
  })
})

describe('ticketingService — testConnection + default resolution', () => {
  it('runs the adapter probe and persists the status', async () => {
    db.ticketingConnection.findFirst.mockResolvedValue(snowRow())
    db.ticketingConnection.update.mockResolvedValue(snowRow())

    const res = await ticketingService.testConnection('tc-1', CUSTOMER)

    expect(mockAdapter.testConnection).toHaveBeenCalled()
    expect(res).toEqual({ success: true, message: 'Connected', latencyMs: 12 })
    expect(db.ticketingConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONNECTED' }) }),
    )
  })

  it('resolveConnectionRow falls back to the tenant default when no id is given', async () => {
    db.ticketingConnection.findFirst.mockResolvedValue(snowRow())

    const row = await ticketingService.resolveConnectionRow(CUSTOMER)

    expect(row.id).toBe('tc-1')
    expect(db.ticketingConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER, isDefault: true, isEnabled: true } }),
    )
  })

  it('resolveConnectionRow throws a helpful error when the tenant has no connection', async () => {
    db.ticketingConnection.findFirst.mockResolvedValue(null)
    await expect(ticketingService.resolveConnectionRow(CUSTOMER)).rejects.toThrow(/No ticketing connection configured/)
  })
})

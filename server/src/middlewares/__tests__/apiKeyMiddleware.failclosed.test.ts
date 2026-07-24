// ========================================================================
// Security regression guard: an API key with NO bound role must FAIL CLOSED
// (403), never silently escalate to the system-admin role. The former
// `keyDetails.roleId || LEGACY_API_KEY_ROLE_ID` fallback was a
// privilege-escalation hole (CWE-269).
// ========================================================================

import { verifyApiKey } from '../apiKeyMiddleware'
import { apiKeyService } from '../../module/api-key/api-key.service'
import prisma from '../../db'

jest.mock('../../db', () => ({
  __esModule: true,
  default: { user: { upsert: jest.fn(), findUnique: jest.fn() } },
}))
jest.mock('../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('../../module/api-key/api-key.service', () => ({
  apiKeyService: { verifyApiKey: jest.fn(), getApiKeyDetails: jest.fn() },
}))

const mockVerify = apiKeyService.verifyApiKey as jest.Mock
const mockDetails = apiKeyService.getApiKeyDetails as jest.Mock
const mockUpsert = (prisma.user as unknown as { upsert: jest.Mock }).upsert

function fakeReq(): any {
  return { headers: { 'x-api-key': 'testkey1234' } }
}
function fakeReply() {
  const reply: any = {
    statusCode: 200,
    status: jest.fn(function (this: any, code: number) {
      reply.statusCode = code
      return reply
    }),
    send: jest.fn(),
  }
  return reply
}

describe('verifyApiKey — fail closed on a role-less key', () => {
  beforeEach(() => jest.clearAllMocks())

  it('denies (403) a key with no bound role and never provisions/escalates', async () => {
    mockVerify.mockResolvedValue(true)
    mockDetails.mockResolvedValue({
      customerId: 'cust-1',
      roleId: null, // no bound role
      type: 'standard',
      scopes: [],
      ownership: 'tenant',
    })
    const reply = fakeReply()

    await verifyApiKey(fakeReq(), reply)

    expect(reply.status).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('no associated role') }),
    )
    // must NOT have escalated: no actor-user provisioning, no user context set
    expect(mockUpsert).not.toHaveBeenCalled()
    expect((fakeReq() as any).user).toBeUndefined()
  })

  it('admits a key WITH a bound role (the happy path still works)', async () => {
    mockVerify.mockResolvedValue(true)
    mockDetails.mockResolvedValue({
      customerId: 'cust-1',
      roleId: 'role-viewer',
      type: 'standard',
      scopes: ['read'],
      ownership: 'tenant',
    })
    mockUpsert.mockResolvedValue({ id: 'actor-1' })
    const req = fakeReq()
    const reply = fakeReply()

    await verifyApiKey(req, reply)

    expect(reply.status).not.toHaveBeenCalledWith(403)
    expect(req.user.roleId).toBe('role-viewer')
    expect(req.user.id).toBe('actor-1')
  })
})

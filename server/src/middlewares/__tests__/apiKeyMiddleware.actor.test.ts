import { resolveApiKeyActorUser, apiKeyActorEmail, __clearApiKeyActorCache } from '../apiKeyMiddleware';
import prisma from '../../db';

jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    user: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../module/api-key/api-key.service', () => ({
  apiKeyService: { verifyApiKey: jest.fn(), getApiKeyDetails: jest.fn() },
}));

const mockedUser = prisma.user as unknown as {
  upsert: jest.Mock;
  findUnique: jest.Mock;
};

describe('resolveApiKeyActorUser', () => {
  const customerId = 'c0ffee00-0000-4000-a000-000000000001';
  const roleId = 'r01e0000-0000-4000-a000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
    __clearApiKeyActorCache();
  });

  it('provisions a non-loginable per-tenant system user on first use', async () => {
    mockedUser.upsert.mockResolvedValue({ id: 'actor-1' });

    const id = await resolveApiKeyActorUser(customerId, roleId);

    expect(id).toBe('actor-1');
    expect(mockedUser.upsert).toHaveBeenCalledWith({
      where: { email: apiKeyActorEmail(customerId) },
      update: {},
      create: expect.objectContaining({
        email: apiKeyActorEmail(customerId),
        customerId,
        roleId,
        isActive: false,
        authProvider: 'API_KEY',
      }),
    });
  });

  it('caches the actor id per tenant (no second DB round-trip)', async () => {
    mockedUser.upsert.mockResolvedValue({ id: 'actor-1' });

    await resolveApiKeyActorUser(customerId, roleId);
    const second = await resolveApiKeyActorUser(customerId, roleId);

    expect(second).toBe('actor-1');
    expect(mockedUser.upsert).toHaveBeenCalledTimes(1);
  });

  it('recovers from a unique-constraint race by re-reading the row', async () => {
    mockedUser.upsert.mockRejectedValue(new Error('P2002 unique constraint'));
    mockedUser.findUnique.mockResolvedValue({ id: 'actor-raced' });

    const id = await resolveApiKeyActorUser(customerId, roleId);

    expect(id).toBe('actor-raced');
    expect(mockedUser.findUnique).toHaveBeenCalledWith({
      where: { email: apiKeyActorEmail(customerId) },
    });
  });

  it('fails closed when the actor row cannot be provisioned', async () => {
    mockedUser.upsert.mockRejectedValue(new Error('db down'));
    mockedUser.findUnique.mockResolvedValue(null);

    await expect(resolveApiKeyActorUser(customerId, roleId)).rejects.toThrow('db down');
  });

  it('derives a reserved, tenant-unique email', () => {
    expect(apiKeyActorEmail('abc')).toBe('api-integration@abc.apikey.system.veltrix.internal');
  });
});

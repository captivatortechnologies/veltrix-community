import { environmentService } from '../environment.service';
import { EnvironmentError } from '../environment.schema';
import prisma from '../../../db';

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    tag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    environmentPolicy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    deployment: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    configurationCanvasTag: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const db = prisma as unknown as {
  tag: Record<string, jest.Mock>;
  environmentPolicy: Record<string, jest.Mock>;
  deployment: Record<string, jest.Mock>;
  configurationCanvasTag: Record<string, jest.Mock>;
  user: Record<string, jest.Mock>;
};

const CUSTOMER = 'cust-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('environmentService.list', () => {
  it('returns each environment with owner, policy, and usage counts', async () => {
    db.tag.findMany.mockResolvedValue([
      { id: 'env-prod', name: 'prod', ownerId: 'user-1', owner: { id: 'user-1', name: 'Ada', email: 'ada@x.com' } },
      { id: 'env-dev', name: 'dev', ownerId: null, owner: null },
    ]);
    db.environmentPolicy.findMany.mockResolvedValue([
      { id: 'pol-1', tagId: 'env-prod', appId: '', requireApproval: true, minApprovers: 2, requiredApproverRoles: ['sre'], deploymentStrategy: 'CANARY', canarySteps: [10, 50, 100], healthCheckTimeout: 300, autoRollbackOnError: true, errorRateThreshold: 5, requirePreviousEnv: false, previousEnvTagId: null },
    ]);
    db.deployment.groupBy.mockResolvedValue([{ environmentId: 'env-prod', _count: { _all: 3 } }]);
    db.configurationCanvasTag.groupBy.mockResolvedValue([{ tagId: 'env-dev', _count: { _all: 5 } }]);

    const result = await environmentService.list(CUSTOMER);

    // Global policies are read with appId '' (empty string), not null.
    expect(db.environmentPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ appId: '' }) }),
    );

    expect(result).toHaveLength(2);

    const prod = result.find((e) => e.id === 'env-prod')!;
    expect(prod.owner).toEqual({ id: 'user-1', name: 'Ada', email: 'ada@x.com' });
    expect(prod.deploymentCount).toBe(3);
    expect(prod.canvasCount).toBe(0);
    expect(prod.policy).toMatchObject({ requireApproval: true, minApprovers: 2, deploymentStrategy: 'CANARY', isDefault: false });

    const dev = result.find((e) => e.id === 'env-dev')!;
    expect(dev.owner).toBeNull();
    expect(dev.canvasCount).toBe(5);
    // No stored policy -> defaults, flagged isDefault
    expect(dev.policy).toMatchObject({ isDefault: true, requireApproval: true, deploymentStrategy: 'ROLLING' });
  });

  it('short-circuits to an empty list when the customer has no tags', async () => {
    db.tag.findMany.mockResolvedValue([]);
    const result = await environmentService.list(CUSTOMER);
    expect(result).toEqual([]);
    expect(db.environmentPolicy.findMany).not.toHaveBeenCalled();
  });
});

describe('environmentService.create', () => {
  it('creates an environment', async () => {
    db.tag.findFirst.mockResolvedValue(null);
    db.tag.create.mockResolvedValue({ id: 'env-new', name: 'staging', ownerId: null, owner: null });

    const created = await environmentService.create(CUSTOMER, { name: 'staging' });

    expect(created).toMatchObject({ id: 'env-new', name: 'staging', deploymentCount: 0, canvasCount: 0 });
    expect(db.tag.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'staging', customerId: CUSTOMER }) }),
    );
  });

  it('rejects a duplicate name with a 409', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'existing', name: 'prod' });

    await expect(environmentService.create(CUSTOMER, { name: 'prod' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.tag.create).not.toHaveBeenCalled();
  });

  it('rejects an ownerId that is not a user in the customer', async () => {
    db.user.findFirst.mockResolvedValue(null);

    await expect(
      environmentService.create(CUSTOMER, { name: 'qa', ownerId: 'outsider' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('environmentService.remove', () => {
  it('blocks deletion when deployments reference the environment', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-prod', customerId: CUSTOMER });
    db.deployment.count.mockResolvedValue(2);

    await expect(environmentService.remove('env-prod', CUSTOMER)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.tag.delete).not.toHaveBeenCalled();
  });

  it('deletes when no deployments reference it', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-dev', customerId: CUSTOMER });
    db.deployment.count.mockResolvedValue(0);
    db.tag.delete.mockResolvedValue({ id: 'env-dev' });

    await environmentService.remove('env-dev', CUSTOMER);
    expect(db.tag.delete).toHaveBeenCalledWith({ where: { id: 'env-dev' } });
  });

  it('404s for an unknown environment', async () => {
    db.tag.findFirst.mockResolvedValue(null);
    await expect(environmentService.remove('missing', CUSTOMER)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('environmentService.upsertPolicy', () => {
  it('rejects non-ascending canary steps', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-prod', customerId: CUSTOMER });

    await expect(
      environmentService.upsertPolicy('env-prod', CUSTOMER, { canarySteps: [50, 10, 100] }),
    ).rejects.toBeInstanceOf(EnvironmentError);
  });

  it('rejects an invalid deployment strategy', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-prod', customerId: CUSTOMER });

    await expect(
      environmentService.upsertPolicy('env-prod', CUSTOMER, { deploymentStrategy: 'TELEPORT' as any }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates the global policy when none exists', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-prod', customerId: CUSTOMER });
    db.environmentPolicy.findFirst.mockResolvedValue(null);
    db.environmentPolicy.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'pol-new', ...data }));

    const result = await environmentService.upsertPolicy('env-prod', CUSTOMER, {
      requireApproval: false,
      minApprovers: 0,
      deploymentStrategy: 'DIRECT',
    });

    expect(db.environmentPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagId: 'env-prod', customerId: CUSTOMER, appId: '', requireApproval: false, deploymentStrategy: 'DIRECT' }),
      }),
    );
    expect(result).toMatchObject({ id: 'pol-new', requireApproval: false, deploymentStrategy: 'DIRECT', isDefault: false });
  });

  it('updates the existing global policy in place', async () => {
    db.tag.findFirst.mockResolvedValue({ id: 'env-prod', customerId: CUSTOMER });
    db.environmentPolicy.findFirst.mockResolvedValue({
      id: 'pol-1', tagId: 'env-prod', customerId: CUSTOMER, appId: '',
      requireApproval: true, minApprovers: 1, requiredApproverRoles: [], deploymentStrategy: 'ROLLING',
      canarySteps: [10, 25, 50, 100], healthCheckTimeout: 300, autoRollbackOnError: true, errorRateThreshold: 5,
      requirePreviousEnv: false, previousEnvTagId: null,
    });
    db.environmentPolicy.update.mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, tagId: 'env-prod', appId: '', ...data }));

    const result = await environmentService.upsertPolicy('env-prod', CUSTOMER, { minApprovers: 3 });

    expect(db.environmentPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pol-1' }, data: expect.objectContaining({ minApprovers: 3 }) }),
    );
    expect(result.minApprovers).toBe(3);
  });

  it('validates previousEnvTagId points at another environment when the gate is on', async () => {
    db.tag.findFirst
      .mockResolvedValueOnce({ id: 'env-prod', customerId: CUSTOMER }) // getTagOrThrow
      .mockResolvedValueOnce(null); // previousEnvTagId lookup fails

    await expect(
      environmentService.upsertPolicy('env-prod', CUSTOMER, {
        requirePreviousEnv: true,
        previousEnvTagId: 'ghost-env',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

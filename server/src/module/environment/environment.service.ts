import prisma from '../../db';
import { loggerService } from '../../module/logger/logger.service';
import {
  CreateEnvironmentBody,
  UpdateEnvironmentBody,
  UpdatePolicyBody,
  EnvironmentRecord,
  EnvironmentPolicyResponse,
  EnvironmentError,
  DEFAULT_POLICY,
  DEPLOYMENT_STRATEGIES,
  DeploymentStrategyValue,
} from './environment.schema';

const OWNER_SELECT = { id: true, name: true, email: true } as const;

// Turn a stored EnvironmentPolicy row (or null) into the response shape.
function shapePolicy(tagId: string, policy: any | null): EnvironmentPolicyResponse {
  if (!policy) {
    return {
      id: null,
      tagId,
      appId: null,
      ...DEFAULT_POLICY,
      isDefault: true,
    };
  }
  return {
    id: policy.id,
    tagId: policy.tagId,
    // Global policies are stored with appId '' (empty string); surface that as
    // null in the response so the API contract ("global = null") is unchanged.
    appId: policy.appId || null,
    requireApproval: policy.requireApproval,
    minApprovers: policy.minApprovers,
    requiredApproverRoles: policy.requiredApproverRoles ?? [],
    deploymentStrategy: policy.deploymentStrategy,
    canarySteps: policy.canarySteps ?? [],
    healthCheckTimeout: policy.healthCheckTimeout,
    autoRollbackOnError: policy.autoRollbackOnError,
    errorRateThreshold: policy.errorRateThreshold,
    requirePreviousEnv: policy.requirePreviousEnv,
    previousEnvTagId: policy.previousEnvTagId ?? null,
    isDefault: false,
  };
}

// Confirm a userId belongs to the customer (owner assignment / validation).
async function assertUserInCustomer(userId: string, customerId: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, customerId } });
  if (!user) {
    throw new EnvironmentError('Owner must be a user in this organization', 400);
  }
}

// Fetch a tag scoped to the customer or throw a 404.
async function getTagOrThrow(id: string, customerId: string) {
  const tag = await prisma.tag.findFirst({ where: { id, customerId } });
  if (!tag) {
    throw new EnvironmentError('Environment not found', 404);
  }
  return tag;
}

// The global policy for a tag. Global policies are stored with appId = ''
// (empty string), matching the convention the pipeline enforcement code uses.
// The unique constraint is (tagId, customerId, appId); we use findFirst so an
// empty-string appId behaves consistently regardless of Prisma null-handling.
async function findGlobalPolicy(tagId: string, customerId: string) {
  return prisma.environmentPolicy.findFirst({
    where: { tagId, customerId, appId: '' },
  });
}

export const environmentService = {
  // List every environment (tag) for the customer with ownership, the global
  // policy, and usage counts.
  async list(customerId: string): Promise<EnvironmentRecord[]> {
    loggerService.info(`Listing environments for customer ${customerId}`);

    const tags = await prisma.tag.findMany({
      where: { customerId },
      include: { owner: { select: OWNER_SELECT } },
      orderBy: { name: 'asc' },
    });

    if (tags.length === 0) return [];

    const tagIds = tags.map((t) => t.id);

    const [policies, deploymentCounts, canvasCounts] = await Promise.all([
      prisma.environmentPolicy.findMany({
        where: { customerId, appId: '', tagId: { in: tagIds } },
      }),
      prisma.deployment.groupBy({
        by: ['environmentId'],
        where: { customerId, environmentId: { in: tagIds } },
        _count: { _all: true },
      }),
      prisma.configurationCanvasTag.groupBy({
        by: ['tagId'],
        where: { tagId: { in: tagIds } },
        _count: { _all: true },
      }),
    ]);

    const policyByTag = new Map(policies.map((p) => [p.tagId, p]));
    const deployCountByTag = new Map(
      deploymentCounts.map((d) => [d.environmentId, d._count._all]),
    );
    const canvasCountByTag = new Map(
      canvasCounts.map((c) => [c.tagId, c._count._all]),
    );

    return tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      ownerId: tag.ownerId ?? null,
      owner: tag.owner ?? null,
      policy: shapePolicy(tag.id, policyByTag.get(tag.id) ?? null),
      deploymentCount: deployCountByTag.get(tag.id) ?? 0,
      canvasCount: canvasCountByTag.get(tag.id) ?? 0,
    }));
  },

  // Create a new environment (tag).
  async create(customerId: string, body: CreateEnvironmentBody): Promise<EnvironmentRecord> {
    const name = (body.name ?? '').trim();
    if (!name) {
      throw new EnvironmentError('Environment name is required', 400);
    }

    if (body.ownerId) {
      await assertUserInCustomer(body.ownerId, customerId);
    }

    const existing = await prisma.tag.findFirst({ where: { name, customerId } });
    if (existing) {
      throw new EnvironmentError('An environment with this name already exists', 409);
    }

    const tag = await prisma.tag.create({
      data: { name, customerId, ownerId: body.ownerId ?? null },
      include: { owner: { select: OWNER_SELECT } },
    });

    loggerService.info(`Created environment ${tag.id} (${name}) for customer ${customerId}`);

    return {
      id: tag.id,
      name: tag.name,
      ownerId: tag.ownerId ?? null,
      owner: tag.owner ?? null,
      policy: shapePolicy(tag.id, null),
      deploymentCount: 0,
      canvasCount: 0,
    };
  },

  // Update name and/or owner. ownerId === null clears the owner.
  async update(
    id: string,
    customerId: string,
    body: UpdateEnvironmentBody,
  ): Promise<EnvironmentRecord> {
    await getTagOrThrow(id, customerId);

    const data: { name?: string; ownerId?: string | null } = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        throw new EnvironmentError('Environment name cannot be empty', 400);
      }
      const dup = await prisma.tag.findFirst({
        where: { name, customerId, NOT: { id } },
      });
      if (dup) {
        throw new EnvironmentError('An environment with this name already exists', 409);
      }
      data.name = name;
    }

    if (body.ownerId !== undefined) {
      if (body.ownerId === null) {
        data.ownerId = null;
      } else {
        await assertUserInCustomer(body.ownerId, customerId);
        data.ownerId = body.ownerId;
      }
    }

    const tag = await prisma.tag.update({
      where: { id },
      data,
      include: { owner: { select: OWNER_SELECT } },
    });

    const [policy, deploymentCount, canvasCount] = await Promise.all([
      findGlobalPolicy(id, customerId),
      prisma.deployment.count({ where: { environmentId: id, customerId } }),
      prisma.configurationCanvasTag.count({ where: { tagId: id } }),
    ]);

    return {
      id: tag.id,
      name: tag.name,
      ownerId: tag.ownerId ?? null,
      owner: tag.owner ?? null,
      policy: shapePolicy(id, policy),
      deploymentCount,
      canvasCount,
    };
  },

  // Delete an environment. Blocked (409) if any deployment references it.
  async remove(id: string, customerId: string): Promise<void> {
    await getTagOrThrow(id, customerId);

    const deploymentCount = await prisma.deployment.count({
      where: { environmentId: id, customerId },
    });
    if (deploymentCount > 0) {
      throw new EnvironmentError(
        'This environment has deployments; remove or archive them first',
        409,
      );
    }

    // The environment's EnvironmentPolicy rows reference the Tag with a RESTRICT
    // foreign key, so they must be removed first. Do both atomically.
    await prisma.$transaction([
      prisma.environmentPolicy.deleteMany({ where: { tagId: id } }),
      prisma.tag.delete({ where: { id } }),
    ]);
    loggerService.info(`Deleted environment ${id} for customer ${customerId}`);
  },

  // Get the global policy for an environment (or defaults when none exists).
  async getPolicy(id: string, customerId: string): Promise<EnvironmentPolicyResponse> {
    await getTagOrThrow(id, customerId);
    const policy = await findGlobalPolicy(id, customerId);
    return shapePolicy(id, policy);
  },

  // Upsert the global (appId = '') policy for an environment.
  async upsertPolicy(
    id: string,
    customerId: string,
    body: UpdatePolicyBody,
  ): Promise<EnvironmentPolicyResponse> {
    await getTagOrThrow(id, customerId);

    // --- Validation ---
    if (body.minApprovers !== undefined && (!Number.isInteger(body.minApprovers) || body.minApprovers < 0)) {
      throw new EnvironmentError('minApprovers must be an integer >= 0', 400);
    }
    if (
      body.deploymentStrategy !== undefined &&
      !DEPLOYMENT_STRATEGIES.includes(body.deploymentStrategy)
    ) {
      throw new EnvironmentError(
        `deploymentStrategy must be one of ${DEPLOYMENT_STRATEGIES.join(', ')}`,
        400,
      );
    }
    if (body.canarySteps !== undefined) {
      const steps = body.canarySteps;
      const valid =
        Array.isArray(steps) &&
        steps.every((s) => Number.isInteger(s) && s >= 1 && s <= 100) &&
        steps.every((s, i) => i === 0 || s > steps[i - 1]);
      if (!valid) {
        throw new EnvironmentError(
          'canarySteps must be ascending integers between 1 and 100',
          400,
        );
      }
    }
    if (body.healthCheckTimeout !== undefined && (!Number.isInteger(body.healthCheckTimeout) || body.healthCheckTimeout < 0)) {
      throw new EnvironmentError('healthCheckTimeout must be a non-negative integer', 400);
    }
    if (
      body.errorRateThreshold !== undefined &&
      (typeof body.errorRateThreshold !== 'number' || body.errorRateThreshold < 0 || body.errorRateThreshold > 100)
    ) {
      throw new EnvironmentError('errorRateThreshold must be a number between 0 and 100', 400);
    }
    if (body.requirePreviousEnv && body.previousEnvTagId) {
      if (body.previousEnvTagId === id) {
        throw new EnvironmentError('previousEnvTagId cannot be the environment itself', 400);
      }
      const prev = await prisma.tag.findFirst({
        where: { id: body.previousEnvTagId, customerId },
      });
      if (!prev) {
        throw new EnvironmentError('previousEnvTagId must be another environment in this organization', 400);
      }
    }

    const existing = await findGlobalPolicy(id, customerId);

    // Only persist fields the caller actually provided; fall back to the
    // existing row's value, then the schema default.
    const merged = {
      requireApproval: body.requireApproval ?? existing?.requireApproval ?? DEFAULT_POLICY.requireApproval,
      minApprovers: body.minApprovers ?? existing?.minApprovers ?? DEFAULT_POLICY.minApprovers,
      requiredApproverRoles:
        body.requiredApproverRoles ?? existing?.requiredApproverRoles ?? DEFAULT_POLICY.requiredApproverRoles,
      deploymentStrategy:
        (body.deploymentStrategy ?? existing?.deploymentStrategy ?? DEFAULT_POLICY.deploymentStrategy) as DeploymentStrategyValue,
      canarySteps: body.canarySteps ?? existing?.canarySteps ?? DEFAULT_POLICY.canarySteps,
      healthCheckTimeout: body.healthCheckTimeout ?? existing?.healthCheckTimeout ?? DEFAULT_POLICY.healthCheckTimeout,
      autoRollbackOnError:
        body.autoRollbackOnError ?? existing?.autoRollbackOnError ?? DEFAULT_POLICY.autoRollbackOnError,
      errorRateThreshold: body.errorRateThreshold ?? existing?.errorRateThreshold ?? DEFAULT_POLICY.errorRateThreshold,
      requirePreviousEnv: body.requirePreviousEnv ?? existing?.requirePreviousEnv ?? DEFAULT_POLICY.requirePreviousEnv,
      previousEnvTagId:
        body.previousEnvTagId !== undefined
          ? body.previousEnvTagId
          : existing?.previousEnvTagId ?? DEFAULT_POLICY.previousEnvTagId,
    };

    // If the previous-env gate is off, don't persist a stale reference.
    if (!merged.requirePreviousEnv) {
      merged.previousEnvTagId = null;
    }

    const saved = existing
      ? await prisma.environmentPolicy.update({
          where: { id: existing.id },
          data: merged as any,
        })
      : await prisma.environmentPolicy.create({
          data: { tagId: id, customerId, appId: '', ...(merged as any) },
        });

    loggerService.info(`Upserted global policy for environment ${id} (customer ${customerId})`);

    return shapePolicy(id, saved);
  },
};

/**
 * Query optimization utilities for Prisma to prevent N+1 problems
 *
 * N+1 queries occur when fetching a list of items (1 query)
 * and then fetching related data for each item (N queries)
 *
 * Solution: Use Prisma's `include` and `select` to fetch all data in one query
 *
 * NOTE: the private-monorepo version of this file also exported a
 * `customerWithRelations` / `CustomerWithRelations` helper keyed off
 * `Prisma.CustomerDefaultArgs`. Community Edition's schema renamed the
 * multi-tenant `Customer` model to the single-tenant `Organization` model
 * (see server/prisma/schema.prisma header), so that helper was dropped here
 * rather than blindly renamed — nothing in this codebase's ported modules
 * consumes it. Add an `organizationWithRelations` helper if a future module
 * needs one.
 */

import { Prisma } from '@prisma/client';

/**
 * Common include patterns for frequently accessed relations
 * These reduce N+1 queries by eagerly loading related data
 */

// Tool with all related data
export const toolWithRelations = Prisma.validator<Prisma.ToolDefaultArgs>()({
  include: {
    credentials: {
      select: {
        id: true,
        type: true,
        username: true,
        createdAt: true,
        updatedAt: true,
        // Exclude sensitive data like password/apiKey
      },
    },
    components: {
      include: {
        tags: true,
      },
    },

  },
});

// Component with tool and tags
export const componentWithRelations = Prisma.validator<Prisma.ComponentDefaultArgs>()({
  include: {
    tool: {
      select: {
        id: true,
        name: true,
        vendor: true,
        category: true,
      },
    },
    tags: true,
    customer: {
      select: {
        id: true,
        name: true,
      },
    },
  },
});

// Configuration history with related entities
export const configHistoryWithRelations = Prisma.validator<Prisma.ConfigurationHistoryDefaultArgs>()({
  include: {
    customer: {
      select: {
        id: true,
        name: true,
      },
    },
    user: {
      select: {
        id: true,
        email: true,
      },
    },
  },
});

/**
 * Type helpers for including relations in queries
 */
export type ToolWithRelations = Prisma.ToolGetPayload<typeof toolWithRelations>;
export type ComponentWithRelations = Prisma.ComponentGetPayload<typeof componentWithRelations>;
export type ConfigHistoryWithRelations = Prisma.ConfigurationHistoryGetPayload<typeof configHistoryWithRelations>;

/**
 * Optimized query builder for paginated results with relations
 *
 * @example
 * ```typescript
 * const result = await buildPaginatedQuery(prisma.tool, {
 *   page: 1,
 *   limit: 20,
 *   where: { customerId: 'abc123' },
 *   include: toolWithRelations.include,
 *   orderBy: { createdAt: 'desc' }
 * });
 * ```
 */
export async function buildPaginatedQuery<T, A>(
  model: {
    findMany: (args: any) => Promise<T[]>;
    count: (args: { where?: any }) => Promise<number>;
  },
  options: {
    page: number;
    limit: number;
    where?: any;
    include?: any;
    select?: any;
    orderBy?: any;
  }
): Promise<{
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}> {
  const { page, limit, where, include, select, orderBy } = options;
  const skip = (page - 1) * limit;

  // Execute count and data queries in parallel to avoid N+1
  const [data, total] = await Promise.all([
    model.findMany({
      where,
      include,
      select,
      orderBy,
      skip,
      take: limit,
    }),
    model.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext,
    hasPrev,
  };
}

/**
 * Batch load related entities to avoid N+1
 * Useful when you can't use include due to complex logic
 *
 * @example
 * ```typescript
 * const tools = await prisma.tool.findMany();
 * const toolIds = tools.map(t => t.id);
 * const components = await batchLoadRelated(
 *   prisma.component,
 *   { toolId: { in: toolIds } }
 * );
 * // Group components by toolId
 * const componentsByTool = groupBy(components, 'toolId');
 * ```
 */
export async function batchLoadRelated<T>(
  model: {
    findMany: (args: any) => Promise<T[]>;
  },
  where: any,
  options?: {
    include?: any;
    select?: any;
    orderBy?: any;
  }
): Promise<T[]> {
  return model.findMany({
    where,
    ...options,
  });
}

/**
 * Helper to group array items by a key
 * Useful after batch loading related entities
 */
export function groupBy<T>(array: T[], key: keyof T): Map<any, T[]> {
  return array.reduce((map, item) => {
    const groupKey = item[key];
    const group = map.get(groupKey) || [];
    group.push(item);
    map.set(groupKey, group);
    return map;
  }, new Map());
}

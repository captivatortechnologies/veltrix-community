import { z } from 'zod';

/**
 * Shared Zod schemas for pagination
 */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const paginationMetadataSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: paginationMetadataSchema,
  });

// Fastify schema (JSON Schema) equivalents
export const paginationQuerySchemaFastify = {
  type: 'object' as const,
  properties: {
    page: { type: 'integer' as const, minimum: 1, default: 1 },
    limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 20 },
    sortBy: { type: 'string' as const, default: 'createdAt' },
    sortOrder: { type: 'string' as const, enum: ['asc', 'desc'], default: 'desc' },
  },
};

export const paginationMetadataSchemaFastify = {
  type: 'object' as const,
  properties: {
    page: { type: 'integer' as const },
    limit: { type: 'integer' as const },
    total: { type: 'integer' as const },
    totalPages: { type: 'integer' as const },
    hasNext: { type: 'boolean' as const },
    hasPrev: { type: 'boolean' as const },
  },
  required: ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev'],
};

export const paginatedResponseSchemaFastify = (itemSchema: any) => ({
  type: 'object' as const,
  properties: {
    data: {
      type: 'array' as const,
      items: itemSchema,
    },
    pagination: paginationMetadataSchemaFastify,
  },
  required: ['data', 'pagination'],
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMetadata = z.infer<typeof paginationMetadataSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationMetadata;
};

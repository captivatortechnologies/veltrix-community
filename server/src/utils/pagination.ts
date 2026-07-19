/**
 * Pagination utility for consistent pagination across the application
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Parse and validate pagination parameters from request
 */
export function parsePaginationParams(query: any): Required<PaginationParams> {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  return { page, limit, sortBy, sortOrder };
}

/**
 * Calculate skip value for Prisma queries
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build paginated response with metadata
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Prisma orderBy helper
 */
export function buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc'): any {
  return { [sortBy]: sortOrder };
}

/**
 * Add pagination headers to Fastify response
 */
export function addPaginationHeaders(
  reply: any,
  page: number,
  limit: number,
  total: number
): void {
  const totalPages = Math.ceil(total / limit);
  
  reply.header('X-Page', page.toString());
  reply.header('X-Limit', limit.toString());
  reply.header('X-Total', total.toString());
  reply.header('X-Total-Pages', totalPages.toString());
  reply.header('X-Has-Next', (page < totalPages).toString());
  reply.header('X-Has-Prev', (page > 1).toString());
}

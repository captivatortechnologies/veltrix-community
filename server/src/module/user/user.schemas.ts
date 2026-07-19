// ========================================================================
// User Schemas
//
// TypeScript types + Fastify JSON schemas for the tenant-scoped user
// management module (list/create/update/delete LOCAL and COGNITO users
// within the authenticated caller's own customer).
//
// NOTE: Fastify response schemas strip undeclared fields in this codebase,
// so EVERY response field must be declared here.
// ========================================================================

export const AUTH_PROVIDERS = ['LOCAL', 'COGNITO'] as const
export type AuthProviderValue = (typeof AUTH_PROVIDERS)[number]

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

/** Wire shape returned by list/create/update — mirrors the client `User` type (authService.ts). */
export interface UserSummary {
  id: string
  name: string | null
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  email: string
  role: string
  customerId: string
  authProvider: string
}

export interface ListUsersQuery {
  /** Filter by auth provider, e.g. `?authProvider=LOCAL` (used by the admin users list). */
  authProvider?: string
}

export interface CreateUserRequest {
  name?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  email: string
  /** Required when authProvider is LOCAL (or omitted, which defaults to LOCAL). */
  password?: string
  roleId: string
  authProvider?: AuthProviderValue
}

export interface UpdateUserRequest {
  name?: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  email?: string
  roleId?: string
  /** Optional password reset performed inline via the edit form. */
  password?: string
}

export interface UserIdParams {
  id: string
}

// ---------------------------------------------------------------------------
// JSON schemas (Swagger + response serialization)
// ---------------------------------------------------------------------------

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
} as const

export const userSummarySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', nullable: true },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    phoneNumber: { type: 'string', nullable: true },
    email: { type: 'string' },
    role: { type: 'string' },
    customerId: { type: 'string', format: 'uuid' },
    authProvider: { type: 'string' },
  },
} as const

export const userListResponseSchema = {
  type: 'array',
  items: userSummarySchema,
} as const

export const listUsersQuerySchema = {
  type: 'object',
  properties: {
    authProvider: { type: 'string' },
  },
} as const

export const createUserRequestSchema = {
  type: 'object',
  required: ['email', 'roleId'],
  properties: {
    name: { type: 'string', maxLength: 256 },
    firstName: { type: 'string', maxLength: 128 },
    lastName: { type: 'string', maxLength: 128 },
    phoneNumber: { type: 'string', maxLength: 32 },
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8, maxLength: 256 },
    roleId: { type: 'string' },
    authProvider: { type: 'string', enum: [...AUTH_PROVIDERS] },
  },
} as const

export const updateUserRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 256 },
    firstName: { type: 'string', maxLength: 128 },
    lastName: { type: 'string', maxLength: 128 },
    phoneNumber: { type: 'string', maxLength: 32 },
    email: { type: 'string', format: 'email' },
    roleId: { type: 'string' },
    password: { type: 'string', minLength: 8, maxLength: 256 },
  },
} as const

export const userIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const

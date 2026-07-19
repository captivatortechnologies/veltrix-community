// ========================================================================
// User Routes
//
// Registered under /api (see server.ts) — GET/POST /users, PUT/DELETE
// /users/:id. Tenant-scoped user management for the authenticated caller's
// own customer. All routes:
//   - require a valid JWT (verifyToken)
//   - require the `user` resource permission (hasPermission)
//   - declare every response field (this codebase strips undeclared fields)
//
// Cross-tenant user management is a deliberately separate surface — see
// module/platform-admin/user-management/ (gated by ensurePlatformAdmin).
// ========================================================================

import { FastifyInstance } from 'fastify'
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware'
import { userController } from './user.controller'
import {
  createUserRequestSchema,
  errorSchema,
  listUsersQuerySchema,
  updateUserRequestSchema,
  userIdParamsSchema,
  userListResponseSchema,
  userSummarySchema,
} from './user.schemas'

export async function userRoutes(fastify: FastifyInstance) {
  const readAuth = [verifyToken, hasPermission('user', 'read')]
  const writeAuth = [verifyToken, hasPermission('user', 'write')]

  // List users for the authenticated caller's tenant
  fastify.get('/users', {
    preHandler: readAuth,
    schema: {
      tags: ['users'],
      summary: 'List users',
      description: 'Returns users for the authenticated caller\'s tenant, optionally filtered by authProvider',
      querystring: listUsersQuerySchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: userListResponseSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
    handler: userController.list,
  })

  // Create a user (LOCAL or COGNITO) within the authenticated caller's tenant
  fastify.post('/users', {
    preHandler: writeAuth,
    schema: {
      tags: ['users'],
      summary: 'Create a user',
      description: 'Creates a LOCAL or COGNITO user within the authenticated caller\'s own tenant',
      body: createUserRequestSchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: userSummarySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
    handler: userController.create,
  })

  // Update a user within the authenticated caller's tenant
  fastify.put('/users/:id', {
    preHandler: writeAuth,
    schema: {
      tags: ['users'],
      summary: 'Update a user',
      description: 'Updates a user that belongs to the authenticated caller\'s own tenant',
      params: userIdParamsSchema,
      body: updateUserRequestSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: userSummarySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: userController.update,
  })

  // Delete a user within the authenticated caller's tenant
  fastify.delete('/users/:id', {
    preHandler: writeAuth,
    schema: {
      tags: ['users'],
      summary: 'Delete a user',
      description: 'Deletes a user that belongs to the authenticated caller\'s own tenant',
      params: userIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        204: { type: 'null' },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: userController.delete,
  })
}

export default userRoutes

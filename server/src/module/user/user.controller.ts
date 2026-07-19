// ========================================================================
// User Controller
//
// Maps HTTP requests to userService and service errors to HTTP status
// codes. Tenancy comes exclusively from the authenticated principal
// (request.user.customerId) — never from the request body/params.
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import { loggerService } from '../logger/logger.service'
import { userService, UserServiceError } from './user.service'
import type {
  CreateUserRequest,
  ListUsersQuery,
  UpdateUserRequest,
  UserIdParams,
} from './user.schemas'

function getCustomerId(request: FastifyRequest): string {
  const customerId = request.user?.customerId
  if (!customerId) {
    throw new UserServiceError('Authentication required', 401)
  }
  return customerId
}

function sendError(reply: FastifyReply, error: unknown, fallbackMessage: string): void {
  if (error instanceof UserServiceError) {
    reply.status(error.statusCode).send({ error: error.message })
    return
  }

  loggerService.error(fallbackMessage, error)
  reply.status(500).send({ error: fallbackMessage })
}

export const userController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { authProvider } = request.query as ListUsersQuery
      const users = await userService.listUsers(customerId, authProvider)
      reply.send(users)
    } catch (error) {
      sendError(reply, error, 'Error fetching users')
    }
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const user = await userService.createUser(customerId, request.body as CreateUserRequest)
      reply.status(201).send(user)
    } catch (error) {
      sendError(reply, error, 'Error creating user')
    }
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as UserIdParams
      const user = await userService.updateUser(customerId, id, request.body as UpdateUserRequest)
      reply.send(user)
    } catch (error) {
      sendError(reply, error, 'Error updating user')
    }
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as UserIdParams
      await userService.deleteUser(customerId, id)
      reply.status(204).send()
    } catch (error) {
      sendError(reply, error, 'Error deleting user')
    }
  },
}

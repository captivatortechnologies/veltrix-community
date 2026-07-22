// Ticketing controller — every handler is scoped to request.user.customerId
// (the authenticated tenant). Mirrors cloud-account.controller.ts error mapping.
//
// COMPILES once ticketing.service.ts compiles (i.e. after the Prisma models are
// added + generated). Route wiring lives in ticketing.route.ts.

import { FastifyRequest, FastifyReply } from 'fastify'
import { ticketingService } from './ticketing.service'
import { loggerService } from '../logger/logger.service'
import type {
  CreateTicketingConnectionRequest,
  UpdateTicketingConnectionRequest,
  CreateTicketForCanvasRequest,
  LinkExistingTicketRequest,
} from '../../../../shared/types/ticketing'

const NOT_FOUND = /not found/i

function requireCustomer(request: FastifyRequest, reply: FastifyReply): string | null {
  const customerId = request.user?.customerId
  if (!customerId) {
    reply.status(401).send({ error: 'Authentication required' })
    return null
  }
  return customerId
}

export const ticketingController = {
  // --- Connections -----------------------------------------------------

  list: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    try {
      reply.send(await ticketingService.listConnections(customerId))
    } catch (error) {
      loggerService.error('Error listing ticketing connections:', error)
      reply.status(500).send({ error: 'Failed to list ticketing connections' })
    }
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { id } = request.params as { id: string }
    try {
      reply.send(await ticketingService.getConnection(id, customerId))
    } catch (error) {
      if (error instanceof Error && NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
      else {
        loggerService.error('Error fetching ticketing connection:', error)
        reply.status(500).send({ error: 'Failed to fetch ticketing connection' })
      }
    }
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    try {
      const data = request.body as CreateTicketingConnectionRequest
      reply.status(201).send(await ticketingService.createConnection(customerId, data))
    } catch (error) {
      if (error instanceof Error) reply.status(400).send({ error: error.message })
      else {
        loggerService.error('Error creating ticketing connection:', error)
        reply.status(500).send({ error: 'Failed to create ticketing connection' })
      }
    }
  },

  update: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { id } = request.params as { id: string }
    try {
      const data = request.body as UpdateTicketingConnectionRequest
      reply.send(await ticketingService.updateConnection(id, customerId, data))
    } catch (error) {
      if (error instanceof Error) {
        if (NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
        else reply.status(400).send({ error: error.message })
      } else {
        loggerService.error('Error updating ticketing connection:', error)
        reply.status(500).send({ error: 'Failed to update ticketing connection' })
      }
    }
  },

  remove: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { id } = request.params as { id: string }
    try {
      reply.send(await ticketingService.deleteConnection(id, customerId))
    } catch (error) {
      if (error instanceof Error && NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
      else {
        loggerService.error('Error deleting ticketing connection:', error)
        reply.status(500).send({ error: 'Failed to delete ticketing connection' })
      }
    }
  },

  test: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { id } = request.params as { id: string }
    try {
      reply.send(await ticketingService.testConnection(id, customerId))
    } catch (error) {
      if (error instanceof Error && NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
      else {
        loggerService.error('Error testing ticketing connection:', error)
        reply.status(500).send({ error: 'Failed to test ticketing connection' })
      }
    }
  },

  // --- Canvas ↔ ticket links ------------------------------------------

  listLinks: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { canvasId } = request.params as { canvasId: string }
    try {
      reply.send(await ticketingService.listLinksForCanvas(canvasId, customerId))
    } catch (error) {
      loggerService.error('Error listing ticket links:', error)
      reply.status(500).send({ error: 'Failed to list ticket links' })
    }
  },

  createTicket: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const userId = request.user!.id
    const { canvasId } = request.params as { canvasId: string }
    try {
      const data = request.body as CreateTicketForCanvasRequest
      reply.status(201).send(await ticketingService.createTicketForCanvas(canvasId, customerId, userId, data))
    } catch (error) {
      if (error instanceof Error) {
        if (NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
        else reply.status(400).send({ error: error.message })
      } else {
        loggerService.error('Error creating ticket for canvas:', error)
        reply.status(500).send({ error: 'Failed to create ticket' })
      }
    }
  },

  linkTicket: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const userId = request.user!.id
    const { canvasId } = request.params as { canvasId: string }
    try {
      const data = request.body as LinkExistingTicketRequest
      reply.status(201).send(await ticketingService.linkExistingTicket(canvasId, customerId, userId, data))
    } catch (error) {
      if (error instanceof Error) {
        if (NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
        else reply.status(400).send({ error: error.message })
      } else {
        loggerService.error('Error linking ticket to canvas:', error)
        reply.status(500).send({ error: 'Failed to link ticket' })
      }
    }
  },

  unlink: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { linkId } = request.params as { linkId: string }
    try {
      reply.send(await ticketingService.unlink(linkId, customerId))
    } catch (error) {
      if (error instanceof Error && NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
      else {
        loggerService.error('Error removing ticket link:', error)
        reply.status(500).send({ error: 'Failed to remove ticket link' })
      }
    }
  },

  closeLink: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply)
    if (!customerId) return
    const { linkId } = request.params as { linkId: string }
    try {
      reply.send(await ticketingService.closeLink(linkId, customerId))
    } catch (error) {
      if (error instanceof Error) {
        if (NOT_FOUND.test(error.message)) reply.status(404).send({ error: error.message })
        else reply.status(400).send({ error: error.message })
      } else {
        loggerService.error('Error closing ticket:', error)
        reply.status(500).send({ error: 'Failed to close ticket' })
      }
    }
  },
}

// Ticketing routes.
//
// IMPORTANT: this plugin is NOT yet registered in server.ts. Wiring it in is a
// deliberate, reviewed step (see _ai_tasks/ticketing-integration/plan.md, task 5)
// so nothing changes on the running server until the feature is ready. When
// registered, mount it with `server.register(ticketingRoutes, { prefix: '/api' })`.
//
// Auth: every route requires verifyToken; management routes additionally require
// hasPermission('ticketing', 'read'|'write'). A new 'ticketing' resource must be
// added to server/src/module/role/resource-catalog.ts and seeded on admin roles
// (see plan.md, task 3) — until then the permission check would deny everyone but
// the platform-operator superuser.

import { FastifyInstance } from 'fastify'
import { ticketingController } from './ticketing.controller'
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware'
import {
  ticketingConnectionResponseSchema,
  ticketingConnectionListSchema,
  createTicketingConnectionBodySchema,
  updateTicketingConnectionBodySchema,
  testTicketingConnectionResponseSchema,
  ticketLinkResponseSchema,
  ticketLinkListSchema,
  createTicketForCanvasBodySchema,
  linkExistingTicketBodySchema,
  successMessageSchema,
  errorSchema,
} from './ticketing.schema'

const idParams = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
} as const

const canvasIdParams = {
  type: 'object',
  properties: { canvasId: { type: 'string', format: 'uuid' } },
  required: ['canvasId'],
} as const

const linkIdParams = {
  type: 'object',
  properties: { linkId: { type: 'string', format: 'uuid' } },
  required: ['linkId'],
} as const

export async function ticketingRoutes(fastify: FastifyInstance) {
  // ===================== Tenant provider config =====================

  fastify.get('/ticketing-connections', {
    preHandler: [verifyToken, hasPermission('ticketing', 'read')],
    schema: {
      tags: ['ticketing'],
      summary: 'List the tenant’s ticketing connections (secrets masked)',
      response: { 200: ticketingConnectionListSchema, 401: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.list,
  })

  fastify.get('/ticketing-connections/:id', {
    preHandler: [verifyToken, hasPermission('ticketing', 'read')],
    schema: {
      tags: ['ticketing'],
      summary: 'Get a ticketing connection',
      params: idParams,
      response: { 200: ticketingConnectionResponseSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.get,
  })

  fastify.post('/ticketing-connections', {
    preHandler: [verifyToken, hasPermission('ticketing', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Create a ticketing connection',
      body: createTicketingConnectionBodySchema,
      response: { 201: ticketingConnectionResponseSchema, 400: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.create,
  })

  fastify.put('/ticketing-connections/:id', {
    preHandler: [verifyToken, hasPermission('ticketing', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Update a ticketing connection',
      params: idParams,
      body: updateTicketingConnectionBodySchema,
      response: { 200: ticketingConnectionResponseSchema, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.update,
  })

  fastify.delete('/ticketing-connections/:id', {
    preHandler: [verifyToken, hasPermission('ticketing', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Delete a ticketing connection',
      params: idParams,
      response: { 200: successMessageSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.remove,
  })

  fastify.post('/ticketing-connections/:id/test', {
    preHandler: [verifyToken, hasPermission('ticketing', 'read')],
    schema: {
      tags: ['ticketing'],
      summary: 'Test a ticketing connection (live probe; persists status)',
      params: idParams,
      response: { 200: testTicketingConnectionResponseSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.test,
  })

  // ===================== Canvas ↔ ticket links =====================
  // Namespaced under /configuration-canvas/:canvasId so it reads as a
  // subresource of a configuration. Guarded by the generic configuration-canvas
  // permission the user already needs to act on the canvas.

  fastify.get('/configuration-canvas/:canvasId/tickets', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['ticketing'],
      summary: 'List tickets linked to a configuration',
      params: canvasIdParams,
      response: { 200: ticketLinkListSchema, 401: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.listLinks,
  })

  fastify.post('/configuration-canvas/:canvasId/tickets', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Create a new ticket in the tenant’s provider and link it',
      params: canvasIdParams,
      body: createTicketForCanvasBodySchema,
      response: { 201: ticketLinkResponseSchema, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.createTicket,
  })

  fastify.post('/configuration-canvas/:canvasId/ticket-link', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Link an existing external ticket to a configuration',
      params: canvasIdParams,
      body: linkExistingTicketBodySchema,
      response: { 201: ticketLinkResponseSchema, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.linkTicket,
  })

  fastify.delete('/ticket-links/:linkId', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Remove a ticket link',
      params: linkIdParams,
      response: { 200: successMessageSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.unlink,
  })

  fastify.post('/ticket-links/:linkId/close', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['ticketing'],
      summary: 'Close the external ticket for a link (explicit user action)',
      params: linkIdParams,
      response: { 200: ticketLinkResponseSchema, 400: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: ticketingController.closeLink,
  })
}

export default ticketingRoutes

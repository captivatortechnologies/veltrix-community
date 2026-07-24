import { FastifyInstance } from 'fastify';
import { environmentController } from './environment.controller';
import { hasPermission } from '../../middlewares/authMiddleware';
// MCP/API-key access (2026-07-23): environment routes accept a portal JWT or a
// role-bound API key; RBAC applies identically to both.
import { verifyAuthOrApiKey } from '../../middlewares/apiKeyMiddleware';

// Environments are pipeline-scoped, so they reuse the pipeline permission
// resource ('configuration-canvas') rather than the raw 'tag' resource.
const PERMISSION_RESOURCE = 'configuration-canvas';

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
};

// Loose object schemas: keep additionalProperties so nested owner/policy
// objects are never stripped by Fastify's response serializer.
const environmentSchema = {
  type: 'object',
  additionalProperties: true,
};

const policySchema = {
  type: 'object',
  additionalProperties: true,
};

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Environment (Tag) ID' },
  },
};

const createBodySchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string' },
    ownerId: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

const updateBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    ownerId: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

const policyBodySchema = {
  type: 'object',
  properties: {
    requireApproval: { type: 'boolean' },
    minApprovers: { type: 'integer' },
    requiredApproverRoles: { type: 'array', items: { type: 'string' } },
    deploymentStrategy: { type: 'string', enum: ['DIRECT', 'CANARY', 'BLUE_GREEN', 'ROLLING'] },
    canarySteps: { type: 'array', items: { type: 'integer' } },
    healthCheckTimeout: { type: 'integer' },
    autoRollbackOnError: { type: 'boolean' },
    errorRateThreshold: { type: 'number' },
    requirePreviousEnv: { type: 'boolean' },
    previousEnvTagId: { type: ['string', 'null'] },
  },
  additionalProperties: false,
};

export async function environmentRoutes(fastify: FastifyInstance) {
  // List environments
  // @ts-ignore - middleware type compatibility
  fastify.get('/', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'read')],
    schema: {
      tags: ['environments'],
      summary: 'List environments',
      description: "Returns the authenticated customer's environments with ownership, policy and usage counts",
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'array', items: environmentSchema },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.list,
  });

  // Create environment
  // @ts-ignore - middleware type compatibility
  fastify.post('/', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'write')],
    schema: {
      tags: ['environments'],
      summary: 'Create environment',
      body: createBodySchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: environmentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.create,
  });

  // Update environment (name / owner)
  // @ts-ignore - middleware type compatibility
  fastify.put('/:id', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'write')],
    schema: {
      tags: ['environments'],
      summary: 'Update environment',
      params: idParamsSchema,
      body: updateBodySchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: environmentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.update,
  });

  // Delete environment
  // @ts-ignore - middleware type compatibility
  fastify.delete('/:id', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'write')],
    schema: {
      tags: ['environments'],
      summary: 'Delete environment',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.remove,
  });

  // Get global deployment policy
  // @ts-ignore - middleware type compatibility
  fastify.get('/:id/policy', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'read')],
    schema: {
      tags: ['environments'],
      summary: 'Get environment policy',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: policySchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.getPolicy,
  });

  // Upsert global deployment policy
  // @ts-ignore - middleware type compatibility
  fastify.put('/:id/policy', {
    preHandler: [verifyAuthOrApiKey, hasPermission(PERMISSION_RESOURCE, 'write')],
    schema: {
      tags: ['environments'],
      summary: 'Update environment policy',
      params: idParamsSchema,
      body: policyBodySchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: policySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: environmentController.upsertPolicy,
  });
}

export default environmentRoutes;

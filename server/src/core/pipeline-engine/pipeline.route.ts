import { FastifyInstance } from 'fastify'
import { pipelineController } from './pipeline.controller'
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware'
import {
  ensureCanvasOwnership,
  ensureDeploymentOwnership,
  ensureDriftOwnership,
  tenantPipelineRateLimit,
} from '../../middlewares/tenant-ownership.middleware'

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
}

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
}

const deploymentIdParamsSchema = {
  type: 'object',
  required: ['deploymentId'],
  properties: {
    deploymentId: { type: 'string', format: 'uuid' },
  },
}

const deploymentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    canvasId: { type: 'string', format: 'uuid' },
    environmentId: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: ['QUEUED', 'IN_PROGRESS', 'HEALTH_CHECKING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'ROLLING_BACK', 'ROLLED_BACK'],
    },
    error: { type: ['string', 'null'] },
    strategy: { type: 'string', enum: ['DIRECT', 'CANARY', 'BLUE_GREEN', 'ROLLING'] },
    healthScore: { type: 'number' },
    errorRate: { type: 'number' },
    canaryPercent: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    environment: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    },
    triggeredBy: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
}

export async function pipelineRoutes(fastify: FastifyInstance) {
  // ==================== CANVAS PIPELINE ACTIONS ====================

  // Validate a canvas
  // @ts-ignore
  fastify.post('/canvas/:id/validate', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write'), ensureCanvasOwnership, tenantPipelineRateLimit(30)],
    schema: {
      tags: ['pipeline'],
      summary: 'Validate canvas',
      description: 'Runs the app validator against the canvas configuration',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.validate,
  })

  // Deploy a canvas
  // @ts-ignore
  fastify.post('/canvas/:id/deploy', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write'), ensureCanvasOwnership, tenantPipelineRateLimit(30)],
    schema: {
      tags: ['pipeline'],
      summary: 'Deploy canvas',
      description: 'Queues a deployment for an approved canvas to a target environment',
      params: idParamsSchema,
      body: {
        type: 'object',
        required: ['environmentId'],
        properties: {
          environmentId: { type: 'string', format: 'uuid' },
          strategy: { type: 'string', enum: ['DIRECT', 'CANARY', 'BLUE_GREEN', 'ROLLING'] },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        201: {
          type: 'object',
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.deploy,
  })

  // Get deployments for a canvas
  // @ts-ignore
  fastify.get('/canvas/:id/deployments', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read'), ensureCanvasOwnership],
    schema: {
      tags: ['pipeline'],
      summary: 'List canvas deployments',
      description: 'Returns deployment history for a canvas',
      params: idParamsSchema,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'array', items: deploymentSchema },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.getDeployments,
  })

  // ==================== DEPLOYMENT ACTIONS ====================

  // Get deployment status
  // @ts-ignore
  fastify.get('/deployments/:deploymentId', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Get deployment status',
      description: 'Returns detailed status of a deployment including logs',
      params: deploymentIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: deploymentSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.getDeploymentStatus,
  })

  // Rollback a deployment
  // @ts-ignore
  fastify.post('/deployments/:deploymentId/rollback', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write'), ensureDeploymentOwnership, tenantPipelineRateLimit(30)],
    schema: {
      tags: ['pipeline'],
      summary: 'Rollback deployment',
      description: 'Rolls back a deployment to the previous version',
      params: deploymentIdParamsSchema,
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        201: {
          type: 'object',
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.rollback,
  })

  // Pause a deployment
  // @ts-ignore
  fastify.post('/deployments/:deploymentId/pause', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['pipeline'],
      summary: 'Pause deployment',
      description: 'Pauses an in-progress deployment (canary/rolling)',
      params: deploymentIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.pauseDeployment,
  })

  // Resume a deployment
  // @ts-ignore
  fastify.post('/deployments/:deploymentId/resume', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['pipeline'],
      summary: 'Resume deployment',
      description: 'Resumes a paused deployment',
      params: deploymentIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.resumeDeployment,
  })

  // Promote a deployment to next environment
  // @ts-ignore
  fastify.post('/deployments/:deploymentId/promote', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['pipeline'],
      summary: 'Promote deployment',
      description: 'Promotes a successful deployment to the next environment',
      params: deploymentIdParamsSchema,
      body: {
        type: 'object',
        required: ['targetEnvironmentId'],
        properties: {
          targetEnvironmentId: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        201: {
          type: 'object',
          properties: {
            deploymentId: { type: 'string', format: 'uuid' },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.promote,
  })

  // ==================== PIPELINE DASHBOARD ====================

  // Pipeline summary (dashboard stats)
  // @ts-ignore
  fastify.get('/summary', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Pipeline summary',
      description: 'Returns pipeline dashboard metrics for the customer',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            pendingValidations: { type: 'integer' },
            pendingApprovals: { type: 'integer' },
            activeDeployments: { type: 'integer' },
            failedDeployments: { type: 'integer' },
            unresolvedDrifts: { type: 'integer' },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.getPipelineSummary,
  })

  // ==================== ENVIRONMENT MATRIX ====================

  // Get environment deployment matrix
  // @ts-ignore
  fastify.get('/environment-matrix', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Environment matrix',
      description: 'Returns a matrix of canvases and their deployment status per environment',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            environments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
            matrix: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  canvas: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      toolType: { type: 'string' },
                      entityType: { type: 'string' },
                      status: { type: 'string' },
                      version: { type: 'integer' },
                    },
                  },
                  environments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        environmentId: { type: 'string' },
                        environmentName: { type: 'string' },
                        deployment: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            id: { type: 'string' },
                            status: { type: 'string' },
                            strategy: { type: 'string' },
                            healthScore: { type: 'number', nullable: true },
                            startedAt: { type: 'string', format: 'date-time' },
                            completedAt: { type: 'string', format: 'date-time', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.getEnvironmentMatrix,
  })

  // ==================== DRIFT DETECTION ====================

  // Get drift records
  // @ts-ignore
  fastify.get('/drift', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'List drift records',
      description: 'Returns drift detection records for the customer',
      querystring: {
        type: 'object',
        properties: {
          environmentId: { type: 'string', format: 'uuid' },
          isResolved: { type: 'boolean' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  appId: { type: 'string' },
                  configTypeId: { type: 'string' },
                  severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
                  diffs: { type: 'array' },
                  isResolved: { type: 'boolean' },
                  detectedAt: { type: 'string', format: 'date-time' },
                  resolvedAt: { type: 'string', format: 'date-time' },
                  resolvedAction: { type: 'string' },
                  environment: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  component: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      hostname: { type: 'string' },
                    },
                  },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.getDriftRecords,
  })

  // Resolve a drift record
  // @ts-ignore
  fastify.post('/drift/:driftId/resolve', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write'), ensureDriftOwnership],
    schema: {
      tags: ['pipeline'],
      summary: 'Resolve drift',
      description: 'Acknowledges and resolves a drift detection record',
      params: {
        type: 'object',
        required: ['driftId'],
        properties: {
          driftId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', minLength: 1 },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            isResolved: { type: 'boolean' },
            resolvedAt: { type: 'string', format: 'date-time' },
            resolvedAction: { type: 'string' },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
    handler: pipelineController.resolveDrift,
  })

  // Run drift detection on demand ("Check drift now")
  // @ts-ignore
  fastify.post('/drift/detect', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Run drift detection on demand',
      description: 'Checks deployed configs for drift immediately and returns unresolved records',
      body: {
        type: 'object',
        properties: { environmentId: { type: 'string', format: 'uuid' } },
      },
      security: [{ bearerAuth: [] }],
      response: { 401: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.detectDrift,
  })

  // Drift-check schedule: the tenant default + per-app overrides (Settings).
  fastify.get('/drift/schedule', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Get the tenant + per-app drift-check schedule',
      security: [{ bearerAuth: [] }],
      response: { 401: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.getDriftSchedule,
  })

  fastify.put('/drift/schedule', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['pipeline'],
      summary: 'Set the tenant default or a per-app drift-check frequency',
      body: {
        type: 'object',
        required: ['frequency'],
        properties: {
          appId: { type: 'string' },
          frequency: { type: 'string', enum: ['off', 'hourly', 'daily', 'weekly'] },
        },
      },
      security: [{ bearerAuth: [] }],
      response: { 400: errorSchema, 401: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.setDriftSchedule,
  })

  fastify.delete('/drift/schedule/:appId', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'write')],
    schema: {
      tags: ['pipeline'],
      summary: 'Clear a per-app drift-check override (revert to the tenant default)',
      params: { type: 'object', required: ['appId'], properties: { appId: { type: 'string' } } },
      security: [{ bearerAuth: [] }],
      response: { 400: errorSchema, 401: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.clearDriftSchedule,
  })

  // Drift records for one configuration (config view modal Drift tab)
  // @ts-ignore
  fastify.get('/configuration-canvas/:canvasId/drift', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'List drift records for a configuration',
      params: {
        type: 'object',
        required: ['canvasId'],
        properties: { canvasId: { type: 'string', format: 'uuid' } },
      },
      security: [{ bearerAuth: [] }],
      response: { 401: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.getCanvasDrift,
  })

  // On-demand drift check for one configuration, then return its records
  // @ts-ignore
  fastify.post('/configuration-canvas/:canvasId/drift/check', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['pipeline'],
      summary: 'Check a configuration for drift on demand',
      params: {
        type: 'object',
        required: ['canvasId'],
        properties: { canvasId: { type: 'string', format: 'uuid' } },
      },
      security: [{ bearerAuth: [] }],
      response: { 401: errorSchema, 404: errorSchema, 500: errorSchema },
    },
    handler: pipelineController.checkCanvasDrift,
  })
}

export default pipelineRoutes

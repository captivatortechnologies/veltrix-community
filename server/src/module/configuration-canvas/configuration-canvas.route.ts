import { FastifyInstance } from 'fastify';
import { configurationCanvasController } from './configuration-canvas.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
// URGENT security fix (2026-07-11): every single-record canvas route is now
// additionally app-scoped (resolved from the canvas's toolType) rather than
// gated only by the flat platform configuration-canvas:read/write grant —
// see configuration-canvas.auth.ts for the full rationale.
import { ensureCanvasPermission, ensureCanvasCreatePermission } from './configuration-canvas.auth';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const canvasFieldSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    key: { type: 'string' },
    label: { type: 'string' },
    fieldType: { type: 'string' },
    value: {},
    defaultValue: {},
    required: { type: 'boolean' },
    placeholder: { type: 'string' },
    helpText: { type: 'string' },
    options: { type: 'array', items: { type: 'object' } },
    validation: { type: 'object' },
    order: { type: 'integer' },
    disabled: { type: 'boolean' }
  }
};

const canvasSectionSchema = {
  type: 'object',
  properties: {
    // Stable per-item id preserved across edits (rename-safe deploy identity);
    // any non-empty string, not strictly a UUID.
    id: { type: 'string' },
    name: { type: 'string' },
    icon: { type: 'string' },
    description: { type: 'string' },
    collapsed: { type: 'boolean' },
    order: { type: 'integer' },
    fields: { type: 'array', items: canvasFieldSchema }
  }
};

const canvasSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string' },
    toolType: { type: 'string' },
    entityType: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED'] },
    version: { type: 'integer' },
    customerId: { type: 'string', format: 'uuid' },
    createdById: { type: 'string', format: 'uuid' },
    updatedById: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    sections: { type: 'array', items: canvasSectionSchema },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          canvasId: { type: 'string', format: 'uuid' },
          tagId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
          tag: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' }
            }
          }
        }
      }
    },
    createdBy: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' }
      }
    },
    updatedBy: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' }
      }
    }
  }
};

const createCanvasSchema = {
  type: 'object',
  required: ['name', 'toolType', 'entityType'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string' },
    toolType: { type: 'string', minLength: 1 },
    entityType: { type: 'string', minLength: 1 },
    sections: { type: 'array', items: canvasSectionSchema },
    tagIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
  }
};

const updateCanvasSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED'] },
    sections: { type: 'array', items: canvasSectionSchema },
    tagIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
  }
};

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Canvas ID' }
  }
};

const listQuerySchema = {
  type: 'object',
  properties: {
    toolType: { type: 'string' },
    entityType: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED'] },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    sortBy: { type: 'string', enum: ['name', 'createdAt', 'updatedAt', 'status'], default: 'createdAt' },
    sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
  }
};

const statusUpdateSchema = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED'] },
    comment: { type: 'string' }
  }
};

const duplicateSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 }
  }
};

const historyIdParamsSchema = {
  type: 'object',
  required: ['id', 'historyId'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Canvas ID' },
    historyId: { type: 'string', format: 'uuid', description: 'History entry ID' }
  }
};

const compareQuerySchema = {
  type: 'object',
  required: ['historyId1', 'historyId2'],
  properties: {
    historyId1: { type: 'string', format: 'uuid', description: 'First version history ID' },
    historyId2: { type: 'string', format: 'uuid', description: 'Second version history ID' }
  }
};

const labelSchema = {
  type: 'object',
  required: ['label'],
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 255 }
  }
};

const historyEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    canvasId: { type: 'string', format: 'uuid' },
    version: { type: 'integer' },
    action: { type: 'string' },
    snapshot: { type: 'object' },
    comment: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' }
      }
    }
  }
};

const diffSchema = {
  type: 'object',
  properties: {
    totalChanges: { type: 'integer' },
    added: { type: 'integer' },
    removed: { type: 'integer' },
    modified: { type: 'integer' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['added', 'removed', 'modified'] },
          path: { type: 'string' },
          oldValue: {},
          newValue: {}
        }
      }
    }
  }
};

export async function configurationCanvasRoutes(fastify: FastifyInstance) {
  // Get all configuration canvases. Deliberately stays on the flat platform
  // check (not app-scoped) — this is a multi-row LIST across every tool, not
  // a single canvas whose owning app can be resolved; mirrors the
  // app-config-template.route.ts precedent, which is also single-record.
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/', {
    preHandler: [verifyToken, hasPermission('configuration-canvas', 'read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'List configuration canvases',
      description: 'Returns all configuration canvases for the authenticated user\'s customer',
      querystring: listQuerySchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: canvasSchema },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getAll
  });

  // Get a single configuration canvas
  // @ts-ignore
  fastify.get('/:id', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Get configuration canvas',
      description: 'Returns a specific configuration canvas by ID',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: canvasSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getById
  });

  // Create a new configuration canvas
  // @ts-ignore
  fastify.post('/', {
    preHandler: [verifyToken, ensureCanvasCreatePermission],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Create configuration canvas',
      description: 'Creates a new configuration canvas',
      body: createCanvasSchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: canvasSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.create
  });

  // Update a configuration canvas
  // @ts-ignore
  fastify.put('/:id', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Update configuration canvas',
      description: 'Updates an existing configuration canvas',
      params: idParamsSchema,
      body: updateCanvasSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: canvasSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.update
  });

  // Delete a configuration canvas
  // @ts-ignore
  fastify.delete('/:id', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Delete configuration canvas',
      description: 'Deletes a configuration canvas (only draft or archived)',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.delete
  });

  // Update canvas status (for approval workflow)
  // @ts-ignore
  fastify.patch('/:id/status', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Update canvas status',
      description: 'Updates the status of a configuration canvas (approval workflow)',
      params: idParamsSchema,
      body: statusUpdateSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: canvasSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.updateStatus
  });

  // Get canvas history
  // @ts-ignore
  fastify.get('/:id/history', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Get canvas history',
      description: 'Returns the version history of a configuration canvas',
      params: idParamsSchema,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              canvasId: { type: 'string', format: 'uuid' },
              version: { type: 'integer' },
              action: { type: 'string' },
              snapshot: { type: 'object' },
              comment: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' }
                }
              }
            }
          }
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getHistory
  });

  // Duplicate a canvas
  // @ts-ignore
  fastify.post('/:id/duplicate', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Duplicate canvas',
      description: 'Creates a copy of an existing configuration canvas',
      params: idParamsSchema,
      body: duplicateSchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: canvasSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.duplicate
  });

  // Export canvas as JSON
  // @ts-ignore
  fastify.get('/:id/export', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Export canvas',
      description: 'Exports a configuration canvas as JSON file',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            toolType: { type: 'string' },
            entityType: { type: 'string' },
            sections: { type: 'array' },
            exportedAt: { type: 'string', format: 'date-time' },
            version: { type: 'integer' }
          }
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.exportJson
  });

  // Get a specific version (history entry)
  // @ts-ignore
  fastify.get('/:id/versions/:historyId', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Get version',
      description: 'Returns a specific version/history entry of a configuration canvas',
      params: historyIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: historyEntrySchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getVersion
  });

  // Restore canvas to a previous version
  // @ts-ignore
  fastify.post('/:id/versions/:historyId/restore', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Restore version',
      description: 'Restores a configuration canvas to a previous version (only for draft canvases)',
      params: historyIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: canvasSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.restoreVersion
  });

  // Compare two versions
  // @ts-ignore
  fastify.get('/:id/compare', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Compare versions',
      description: 'Compares two versions of a configuration canvas and returns the differences',
      params: idParamsSchema,
      querystring: compareQuerySchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            version1: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                version: { type: 'integer' },
                action: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            },
            version2: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                version: { type: 'integer' },
                action: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            },
            diff: diffSchema
          }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.compareVersions
  });

  // Add a label to a version
  // @ts-ignore
  fastify.patch('/:id/versions/:historyId/label', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Label version',
      description: 'Adds or updates a label/comment for a specific version',
      params: historyIdParamsSchema,
      body: labelSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: historyEntrySchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.labelVersion
  });

  // ==================== APPROVAL WORKFLOW ROUTES ====================

  // Submit canvas for approval with designated approvers
  // @ts-ignore
  fastify.post('/:id/submit-for-approval', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Submit for approval',
      description: 'Submits a configuration canvas for approval with designated approvers and target environments',
      params: idParamsSchema,
      body: {
        type: 'object',
        required: ['approverIds'],
        properties: {
          approverIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            description: 'User IDs of the designated approvers'
          },
          environmentTagIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Tag IDs of the target environments'
          },
          comment: {
            type: 'string',
            description: 'Optional comment for the approval request'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: canvasSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.submitForApproval
  });

  // Get approval status for a canvas
  // @ts-ignore
  fastify.get('/:id/approvals', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Get approvals',
      description: 'Gets the approval status for a configuration canvas including all approver decisions',
      params: idParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            canvasId: { type: 'string', format: 'uuid' },
            canvasStatus: { type: 'string', enum: ['DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED'] },
            approvals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  approver: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
                  comment: { type: 'string' },
                  submissionComment: { type: 'string' },
                  respondedAt: { type: 'string', format: 'date-time' },
                  createdAt: { type: 'string', format: 'date-time' },
                  environments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                pending: { type: 'integer' },
                approved: { type: 'integer' },
                rejected: { type: 'integer' }
              }
            }
          }
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getApprovals
  });

  // Approve a canvas (by current user as approver)
  // @ts-ignore
  fastify.post('/:id/approve', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Approve canvas',
      description: 'Approves a configuration canvas (user must be an assigned approver)',
      params: idParamsSchema,
      body: {
        type: 'object',
        properties: {
          comment: {
            type: 'string',
            description: 'Optional approval comment'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            canvasId: { type: 'string', format: 'uuid' },
            canvasStatus: { type: 'string' },
            approvals: { type: 'array' },
            summary: { type: 'object' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.approveCanvas
  });

  // Reject a canvas (by current user as approver)
  // @ts-ignore
  fastify.post('/:id/reject', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Reject canvas',
      description: 'Rejects a configuration canvas with a reason (user must be an assigned approver)',
      params: idParamsSchema,
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: {
            type: 'string',
            minLength: 1,
            description: 'Reason for rejection (required)'
          }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            canvasId: { type: 'string', format: 'uuid' },
            canvasStatus: { type: 'string' },
            approvals: { type: 'array' },
            summary: { type: 'object' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.rejectCanvas
  });

  // ==================== REVIEW COMMENTS ROUTES ====================

  const commentSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      canvasId: { type: 'string', format: 'uuid' },
      historyId: { type: 'string', format: 'uuid', nullable: true },
      parentId: { type: 'string', format: 'uuid', nullable: true },
      userId: { type: 'string', format: 'uuid' },
      body: { type: 'string' },
      resolved: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' }
        }
      },
      // Threaded replies (one level shown here; nested arbitrarily at runtime)
      replies: { type: 'array', items: { type: 'object', additionalProperties: true } }
    },
    additionalProperties: true
  };

  const commentIdParamsSchema = {
    type: 'object',
    required: ['id', 'commentId'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Canvas ID' },
      commentId: { type: 'string', format: 'uuid', description: 'Comment ID' }
    }
  };

  // Get threaded review comments for a canvas
  // @ts-ignore
  fastify.get('/:id/comments', {
    preHandler: [verifyToken, ensureCanvasPermission('read')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Get review comments',
      description: 'Returns threaded review comments for a configuration canvas, optionally filtered by version (historyId)',
      params: idParamsSchema,
      querystring: {
        type: 'object',
        properties: {
          historyId: { type: 'string', format: 'uuid', description: 'Filter to a specific version anchor' }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'array', items: commentSchema },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.getComments
  });

  // Add a review comment
  // @ts-ignore
  fastify.post('/:id/comments', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Add review comment',
      description: 'Adds a review comment, optionally anchored to a version and/or a parent comment (threaded)',
      params: idParamsSchema,
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1 },
          historyId: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid' }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        201: commentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.addComment
  });

  // Update a review comment (body and/or resolved)
  // @ts-ignore
  fastify.patch('/:id/comments/:commentId', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Update review comment',
      description: 'Updates a review comment body and/or resolved flag (author or an assigned approver)',
      params: commentIdParamsSchema,
      body: {
        type: 'object',
        properties: {
          body: { type: 'string', minLength: 1 },
          resolved: { type: 'boolean' }
        }
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: commentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.updateComment
  });

  // Delete a review comment
  // @ts-ignore
  fastify.delete('/:id/comments/:commentId', {
    preHandler: [verifyToken, ensureCanvasPermission('write')],
    schema: {
      tags: ['configuration-canvas'],
      summary: 'Delete review comment',
      description: 'Deletes a review comment (author or an assigned approver)',
      params: commentIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: configurationCanvasController.deleteComment
  });
}

export default configurationCanvasRoutes;

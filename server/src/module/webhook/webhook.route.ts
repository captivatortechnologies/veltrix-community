import { FastifyInstance } from 'fastify';
import { webhookController } from './webhook.controller';

// ========================================================================
// AUTH MODEL (R0, RBAC/IdP hardening 2026-07-10)
//
// These routes are intentionally NOT behind verifyToken — external systems
// (CI pipelines, GitHub, generic integrations) cannot obtain a Veltrix JWT.
// They are gated instead by an API key (X-API-Key header), enforced inside
// webhookController.handleWebhook/handleGitHubWebhook via
// webhookService.validateApiKey, which requires the key to:
//   - be valid, unrevoked, and unexpired, AND
//   - be global OR belong to the requesting tenant, AND
//   - carry the `webhook`/`webhooks:write`/`admin:webhook` scope (or be of
//     type 'webhook').
// A request without a valid, webhook-scoped API key is rejected with 401
// before the payload is ever processed — this is NOT a public endpoint.
// The GitHub-specific route additionally requires (when WEBHOOK_SECRET or
// GITHUB_WEBHOOK_SECRET is configured) a valid HMAC X-Hub-Signature-256; see
// webhook.controller.ts.
// ========================================================================
export const webhookRoutes = async (fastify: FastifyInstance) => {
  // Generic webhook endpoint — gated by a webhook-scoped API key (see AUTH
  // MODEL above); handler returns 401 for any request without one.
  fastify.post('/api/webhooks', {
    schema: {
      description: 'Generic webhook endpoint for all sources',
      tags: ['webhooks'],
      headers: {
        type: 'object',
        properties: {
          'X-API-Key': { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['source', 'event', 'payload'],
        properties: {
          source: { type: 'string' },
          event: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          payload: { type: 'object' },
          metadata: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            id: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: webhookController.handleWebhook
  });
  
  // GitHub-specific webhook endpoint
  fastify.post('/api/webhooks/github', {
    schema: {
      description: 'GitHub-specific webhook endpoint',
      tags: ['webhooks'],
      headers: {
        type: 'object',
        properties: {
          'X-API-Key': { type: 'string' },
          'X-GitHub-Event': { type: 'string' },
          'X-GitHub-Delivery': { type: 'string' },
          'X-Hub-Signature-256': { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            id: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: webhookController.handleGitHubWebhook
  });
  
  // Health check endpoint
  fastify.get('/api/webhooks/health', {
    schema: {
      description: 'Health check endpoint for webhooks',
      tags: ['webhooks'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    handler: webhookController.healthCheck
  });
};

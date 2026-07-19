import { FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from './webhook.service';
import { loggerService } from '../logger/logger.service';
import { WebhookNotification } from './webhook.types';

export const webhookController = {
  /**
   * Generic webhook endpoint that accepts notifications from any source
   */
  async handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      loggerService.info('Received webhook request');
      
      // Verify API key from header
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey || !(await webhookService.validateApiKey(apiKey))) {
        loggerService.warn('Invalid or missing API key');
        reply.status(401).send({
          success: false,
          message: 'Invalid or missing API key'
        });
        return;
      }
      
      // Validate request body
      const { source, event, timestamp, payload } = request.body as any;
      
      if (!source || !event || !payload) {
        loggerService.warn('Invalid webhook payload format');
        reply.status(400).send({
          success: false,
          message: 'Invalid webhook payload. Required fields: source, event, payload'
        });
        return;
      }
      
      // Create notification object
      const notification: WebhookNotification = {
        source,
        event,
        timestamp: timestamp || new Date().toISOString(),
        payload
      };
      
      // Process the webhook notification
      const result = await webhookService.processWebhook(notification);
      
      reply.status(result.success ? 200 : 500).send(result);
    } catch (error) {
      loggerService.error('Error handling webhook:', error);
      reply.status(500).send({
        success: false,
        message: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  },
  
  /**
   * GitHub-specific webhook endpoint
   */
  async handleGitHubWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      loggerService.info('Received GitHub webhook request');
      
      // Verify API key from header or query param
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey || !(await webhookService.validateApiKey(apiKey))) {
        loggerService.warn('Invalid or missing API key');
        reply.status(401).send({
          success: false,
          message: 'Invalid or missing API key'
        });
        return;
      }
      
      // Get GitHub event type from header
      const eventType = request.headers['x-github-event'] as string;
      const deliveryId = request.headers['x-github-delivery'] as string;
      const signature = request.headers['x-hub-signature-256'] as string;

      if (!eventType || !deliveryId) {
        loggerService.warn('Missing GitHub event headers');
        reply.status(400).send({
          success: false,
          message: 'Missing GitHub event headers'
        });
        return;
      }

      // HMAC signature verification (R0, RBAC/IdP hardening 2026-07-10):
      // when a real secret is configured, a valid X-Hub-Signature-256 is
      // MANDATORY — a missing or invalid signature is now a 401, not a
      // silent pass-through. Previously the check only ran `if (signature)`,
      // so simply omitting the header bypassed verification entirely even
      // with a secret configured.
      if (webhookService.isGitHubSecretConfigured()) {
        const payload = JSON.stringify(request.body);
        if (!webhookService.validateGitHubSignature(payload, signature)) {
          loggerService.warn('Rejected GitHub webhook: missing or invalid X-Hub-Signature-256', {
            deliveryId,
            eventType,
            hasSignatureHeader: Boolean(signature),
          });
          reply.status(401).send({
            success: false,
            message: 'Invalid or missing GitHub signature'
          });
          return;
        }
      } else {
        // Loud warn on every unverified request — this endpoint is still
        // gated by the required webhook-scoped X-API-Key (checked above),
        // but without WEBHOOK_SECRET/GITHUB_WEBHOOK_SECRET configured the
        // payload itself cannot be proven to originate from GitHub.
        loggerService.warn(
          'SECURITY WARNING: GitHub webhook signature verification is SKIPPED — ' +
          'WEBHOOK_SECRET/GITHUB_WEBHOOK_SECRET is not configured. Set one of these ' +
          'environment variables and configure the same value as the webhook secret ' +
          'in GitHub to enable HMAC verification.',
          { deliveryId, eventType }
        );
      }

      // Map GitHub webhook to our notification format
      const notification: WebhookNotification = {
        source: 'github',
        event: eventType,
        timestamp: new Date().toISOString(),
        payload: {
          ...request.body as any,
          // Extract and normalize fields from GitHub's format
          infrastructureId: (request.body as any).infrastructure_id,
          status: (request.body as any).status || (request.body as any).action || 'unknown',
          deploymentId: (request.body as any).deployment?.id
        },
        metadata: {
          deliveryId,
          signature,
          headers: {
            event: eventType
          }
        }
      };
      
      // Process the webhook notification
      const result = await webhookService.processWebhook(notification);
      
      reply.status(result.success ? 200 : 500).send(result);
    } catch (error) {
      loggerService.error('Error handling GitHub webhook:', error);
      reply.status(500).send({
        success: false,
        message: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  },
  
  /**
   * Health check endpoint for webhooks
   */
  async healthCheck(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      reply.status(200).send({
        success: true,
        message: 'Webhook service is running',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      loggerService.error('Error checking webhook health:', error);
      reply.status(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  }
};

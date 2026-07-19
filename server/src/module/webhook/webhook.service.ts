import crypto from 'crypto';
import { apiKeyService } from '../api-key/api-key.service';
import { loggerService } from '../logger/logger.service';
import { WebhookNotification } from './webhook.types';

// Environment variables
//
// SECURITY: no fallback default. A previous version fell back to a known
// literal ('default-webhook-secret'), which meant an "unconfigured" secret
// still "validated" signatures computed against that public string — worse
// than no verification at all, since it looked verified. Unset now means
// truly unconfigured; callers must check `isGitHubSecretConfigured()` before
// deciding whether an unsigned/unverifiable request is acceptable.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Queue transport: BullMQ (via the shared JobRunner), replacing RabbitMQ.
//
// The JobRunner (server/src/core/job-runner) is the OSS job substrate — a
// Redis-backed BullMQ queue/worker pair that runs in-process with the API
// server (no separate broker/worker deploy, unlike the RabbitMQ producer
// this replaces). `registerQueueWorker` is idempotent (a no-op if the queue
// already exists), so it's safe to call on every webhook — the queue is
// created and its worker started lazily, the first time a webhook actually
// needs it.
//
// Durability note: no consumer for the 'webhooks' queue previously shipped
// in this codebase outside the RabbitMQ producer/consumer pair being
// removed here — the actual functional webhook handling is the in-process
// app dispatch below (`getAppRegistry().dispatchWebhook`), which already ran
// unconditionally regardless of the queue. This BullMQ queue preserves a
// durable, replayable record of each webhook for any future consumer (e.g.
// audit/analytics); its worker here just logs receipt. A queue failure is
// therefore non-fatal to the webhook response — the in-process dispatch is
// the source of truth for "was this webhook handled".
// ---------------------------------------------------------------------------
const WEBHOOK_QUEUE_NAME = 'webhooks';
let webhookQueueRegistered = false;

async function ensureWebhookQueueRegistered(): Promise<void> {
  if (webhookQueueRegistered) return;
  try {
    // Dynamic import (mirrors the cognito/2FA lazy-import pattern elsewhere
    // in this codebase): keeps this module import-safe even in a narrow unit
    // test that only exercises validateApiKey/signature checks and never
    // touches core/job-runner or Redis.
    const { getJobRunner } = await import('../../core/platform-bootstrap');
    getJobRunner().registerQueueWorker(WEBHOOK_QUEUE_NAME, async (job: { id?: string; data: unknown }) => {
      loggerService.debug('Webhook job processed from queue', { jobId: job.id });
    });
    webhookQueueRegistered = true;
  } catch (error) {
    loggerService.error('Failed to register the BullMQ webhooks queue (webhook dispatch still runs in-process):', error);
  }
}

export const webhookService = {
  // Validate API key
  validateApiKey: async (apiKey?: string, customerId?: string): Promise<boolean> => {
    if (!apiKey) {
      return false;
    }
    
    try {
      // Use the API key service to verify the key
      const isValid = await apiKeyService.verifyApiKey(apiKey);
      
      if (!isValid) {
        return false;
      }
      
      // Get API key details to check if it has webhook scope
      const keyDetails = await apiKeyService.getApiKeyDetails(apiKey);
      
      if (!keyDetails) {
        return false;
      }
      
      // Check if the key is global (affects all tenants) or matches the customer ID
      const isGlobalKey = keyDetails.ownership === 'global';
      const matchesCustomerId = !customerId || keyDetails.customerId === customerId;
      
      if (!isGlobalKey && !matchesCustomerId) {
        loggerService.warn('API key customer mismatch', {
          keyCustomerId: keyDetails.customerId,
          requestedCustomerId: customerId
        });
        return false;
      }
      
      // Check if key has webhook:write scope or is a webhook type or has admin:webhook scope
      const hasWebhookScope = 
        keyDetails.scopes && 
        (keyDetails.scopes.includes('webhooks:write') || 
         keyDetails.scopes.includes('webhook:write') ||
         keyDetails.scopes.includes('admin:webhook'));
      
      const isWebhookType = keyDetails.type === 'webhook';
      
      return hasWebhookScope || isWebhookType;
    } catch (error) {
      loggerService.error('Error validating API key:', error);
      return false;
    }
  },
  
  // Whether a real GitHub webhook secret is configured (not the removed
  // literal default). Callers use this to decide whether to hard-require a
  // valid signature or fall back to a loud, logged "unverified" pass-through.
  isGitHubSecretConfigured: (): boolean => {
    return Boolean(WEBHOOK_SECRET);
  },

  // Validate GitHub signature
  validateGitHubSignature: (payload: string, signature?: string): boolean => {
    if (!WEBHOOK_SECRET) {
      // Should never be reached when the caller checks isGitHubSecretConfigured()
      // first, but fail closed regardless.
      return false;
    }

    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    try {
      // Get the signature value (remove 'sha256=' prefix)
      const signatureValue = signature.substring(7);

      // Compute the expected signature
      const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      const signatureBuffer = Buffer.from(signatureValue, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      // Buffers must be equal length for timingSafeEqual — a length mismatch
      // means the signature is invalid, not a crash.
      if (signatureBuffer.length !== expectedBuffer.length) {
        return false;
      }

      // Use constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      loggerService.error('Error validating GitHub signature:', error);
      return false;
    }
  },
  
  // Process the webhook notification
  processWebhook: async (notification: WebhookNotification): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      // Log the webhook notification
      loggerService.info('Processing webhook notification', {
        source: notification.source,
        event: notification.event,
        timestamp: notification.timestamp
      });

      // Generate a unique ID for the notification
      const id = crypto.randomUUID();

      // Enqueue a durable record via BullMQ (see the queue-transport note
      // above). Best-effort: a queue failure must never block the actual
      // webhook handling below, since the in-process app dispatch — not
      // this queue — is what apps rely on.
      try {
        await ensureWebhookQueueRegistered();
        const { getJobRunner } = await import('../../core/platform-bootstrap');
        await getJobRunner().enqueue(WEBHOOK_QUEUE_NAME, {
          id,
          ...notification,
          processedAt: new Date().toISOString()
        });
      } catch (queueError) {
        loggerService.error('Failed to enqueue webhook job (continuing with in-process dispatch):', queueError);
      }

      // Dispatch to any app that owns this webhook's semantics. The platform
      // has no knowledge of infrastructure/provisioning — an app (e.g.
      // splunk-enterprise) declares an `onWebhook` hook and updates its own data.
      try {
        const { getAppRegistry } = await import('../../core/platform-bootstrap');
        await getAppRegistry().dispatchWebhook({
          source: notification.source,
          event: notification.event,
          payload: notification.payload,
        });
      } catch (dispatchErr) {
        loggerService.error('Error dispatching webhook to apps:', dispatchErr);
      }

      return {
        success: true,
        message: 'Webhook notification processed successfully',
        id
      };
    } catch (error) {
      loggerService.error('Error processing webhook notification:', error);
      return {
        success: false,
        message: `Error processing webhook: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
};

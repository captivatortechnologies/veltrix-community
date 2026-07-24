import { FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyService } from '../module/api-key/api-key.service';
import { loggerService } from '../module/logger/logger.service';
import prisma from '../db';

/**
 * Middleware to verify API keys for authentication
 * This allows for API key based authentication instead of JWT tokens
 */
// Define a type for the query parameters
interface ApiKeyQueryParams {
  customerId?: string;
  [key: string]: any;
}

// Attribution for API-key writes. Several write paths persist the acting user
// into NON-NULLABLE FKs (ConfigurationCanvas.createdById, Deployment.triggeredById),
// so the former fixed synthetic UUID (which has no User row) broke every such
// write with an FK violation. Each tenant instead gets one lazily-provisioned,
// non-loginable "API Integration" user (isActive:false, no UserPassword row,
// reserved email) that all of the tenant's API-key actions are attributed to.
const API_KEY_ACTOR_NAME = 'API Integration';
const API_KEY_ACTOR_EMAIL_SUFFIX = '.apikey.system.veltrix.internal';
const apiKeyActorCache = new Map<string, string>(); // customerId -> User.id

export function apiKeyActorEmail(customerId: string): string {
  return `api-integration@${customerId}${API_KEY_ACTOR_EMAIL_SUFFIX}`;
}

export async function resolveApiKeyActorUser(customerId: string, roleId: string): Promise<string> {
  const cached = apiKeyActorCache.get(customerId);
  if (cached) return cached;

  const email = apiKeyActorEmail(customerId);
  try {
    // upsert with an empty update: idempotent under concurrent first requests.
    // The row's roleId is attribution metadata only — authorization always comes
    // from request.user.roleId (the key's bound role), never from this row.
    const actor = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: API_KEY_ACTOR_NAME,
        customerId,
        roleId,
        isActive: false,
        authProvider: 'API_KEY',
      },
    });
    apiKeyActorCache.set(customerId, actor.id);
    return actor.id;
  } catch (error) {
    // Unique-race fallback: another request created the row between our upsert's
    // internal read and write. Re-read before giving up.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      apiKeyActorCache.set(customerId, existing.id);
      return existing.id;
    }
    throw error;
  }
}

/** Test hook — clears the in-memory actor cache. */
export function __clearApiKeyActorCache(): void {
  apiKeyActorCache.clear();
}

export const verifyApiKey = async (request: FastifyRequest<{ Querystring: ApiKeyQueryParams }>, reply: FastifyReply) => {
  try {
    loggerService.debug('API KEY MIDDLEWARE: Checking for API key');

    // Check for API key in X-API-Key header (preferred method)
    let apiKey = request.headers['x-api-key'] as string;
    let apiKeyId = request.headers['x-api-key-id'] as string;

    // If not found, check Authorization header with ApiKey prefix
    if (!apiKey && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader.startsWith('ApiKey ')) {
        apiKey = authHeader.substring(7); // Remove 'ApiKey ' prefix
      }
    }

    if (!apiKey) {
      loggerService.warn('API KEY MIDDLEWARE: No API key found in request');
      return reply.status(401).send({ error: 'API key required' });
    }

    // Mask the key for logging
    const maskedKey = apiKey ? apiKey.substring(0, 4) + '••••••' : 'none';
    loggerService.debug('API KEY MIDDLEWARE: Verifying API key', {
      apiKey: maskedKey,
      apiKeyId: apiKeyId || 'none'
    });

    // First, verify the API key is valid
    const isValid = await apiKeyService.verifyApiKey(apiKey);

    if (!isValid) {
      loggerService.warn('API KEY MIDDLEWARE: Invalid API key');
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // Get the API key details
    const keyDetails = await apiKeyService.getApiKeyDetails(apiKey, apiKeyId);

    if (!keyDetails) {
      loggerService.warn('API KEY MIDDLEWARE: API key details not found');
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // A key's access is governed by the RBAC role assigned when it was created.
    // hasPermission() resolves permissions from request.user.roleId, so setting
    // it to the key's role makes the role's grants the key's controls. Legacy
    // keys created before role-binding have no roleId — preserve their historical
    // behavior by falling back to the system admin role.
    const LEGACY_API_KEY_ROLE_ID = '00000000-0000-4000-a000-000000000001';
    const effectiveRoleId = keyDetails.roleId || LEGACY_API_KEY_ROLE_ID;

    // Resolve the tenant's API-actor user so write paths with non-nullable
    // user FKs (createdById / triggeredById) attribute to a real row.
    const actorUserId = await resolveApiKeyActorUser(keyDetails.customerId, effectiveRoleId);

    // Set up user and customer context for downstream handlers
    (request as any).user = {
      id: actorUserId,
      customerId: keyDetails.customerId,
      roleId: effectiveRoleId,
      apiKey: true,
      apiKeyType: keyDetails.type,
      apiKeyScopes: keyDetails.scopes,
      apiKeyOwnership: keyDetails.ownership
    };

    // Add headers for downstream handlers
    request.headers['x-user-id'] = (request as any).user.id;
    request.headers['x-customer-id'] = keyDetails.customerId;
    request.headers['x-role-id'] = effectiveRoleId;
    request.headers['x-api-key-scopes'] = keyDetails.scopes.join(',');

    loggerService.info('API KEY MIDDLEWARE: API key verified successfully', {
      customerId: keyDetails.customerId,
      apiKeyType: keyDetails.type,
      apiKeyScopes: keyDetails.scopes,
      apiKeyOwnership: keyDetails.ownership
    });

    // Allow request to proceed
  } catch (error) {
    loggerService.error('API KEY MIDDLEWARE ERROR: Error verifying API key', error);
    return reply.status(500).send({ error: 'Internal server error while verifying API key' });
  }
};

/**
 * Middleware to verify either JWT token or API key
 * This allows for both authentication methods
 */
export const verifyAuthOrApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Import verifyToken from authMiddleware
    const { verifyToken } = await import('./authMiddleware');

    // Check for API key first
    if (request.headers['x-api-key'] ||
        (request.headers.authorization && request.headers.authorization.startsWith('ApiKey '))) {
      return verifyApiKey(request as FastifyRequest<{ Querystring: ApiKeyQueryParams }>, reply);
    }

    // If no API key, fall back to JWT token
    return verifyToken(request, reply);
  } catch (error) {
    loggerService.error('Error in auth middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

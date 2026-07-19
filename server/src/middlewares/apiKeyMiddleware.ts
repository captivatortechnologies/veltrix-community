import { FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyService } from '../module/api-key/api-key.service';
import { loggerService } from '../module/logger/logger.service';

/**
 * Middleware to verify API keys for authentication
 * This allows for API key based authentication instead of JWT tokens
 */
// Define a type for the query parameters
interface ApiKeyQueryParams {
  customerId?: string;
  [key: string]: any;
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

    // Set up user and customer context for downstream handlers
    (request as any).user = {
      // Use a fixed ID for API key based authentication
      id: '00000000-0000-4000-a000-000000000002', // API key user ID
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

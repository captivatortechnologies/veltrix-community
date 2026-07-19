import prisma from '../../db';
import { 
  CreateApiKeyType, 
  ApiKeyResponseType, 
  UpdateApiKeyType,
  RegenerateApiKeyType
} from './api-key.schema';
import crypto from 'crypto';
import { loggerService } from '../../module/logger/logger.service';
import { getRolePermissions } from '../../lib/permissions';

/** Identity payload for API-key auth/whoami: the key's role + the permissions
 *  that role grants (what the key can actually do). */
export interface ApiKeyIdentity {
  customerId: string;
  type: string;
  ownership: string;
  role: string | null;
  permissions: string[]; // "resource:action" (with "@appId" suffix when app-scoped)
  scopes: string[];
}

/** Thrown on invalid API-key input (e.g. a role that isn't the tenant's). */
export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyValidationError';
  }
}

// Helper function to convert Prisma API key to our API key response type
const convertApiKey = (apiKey: any): ApiKeyResponseType => ({
  id: apiKey.id,
  name: apiKey.name,
  key: apiKey.key,
  type: apiKey.type as 'api' | 'admin' | 'webhook',
  createdAt: apiKey.createdAt.toISOString(),
  lastUsed: apiKey.lastUsed ? apiKey.lastUsed.toISOString() : null,
  expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
  revoked: apiKey.revoked || false,
  scopes: apiKey.scopes || [],
  roleId: apiKey.roleId ?? null,
  roleName: apiKey.role?.name ?? null
});

const generateRandomKey = (length = 32) => {
  return crypto.randomBytes(length).toString('base64url');
};

export const apiKeyService = {
  // Get all API keys for a customer
  getAllApiKeys: async (customerId: string): Promise<ApiKeyResponseType[]> => {
    const apiKeys = await prisma.apiKey.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { role: { select: { name: true } } }
    });
    
    // Mask the keys for security and convert to our response type
    return apiKeys.map(key => ({
      ...convertApiKey(key),
      key: key.key.substring(0, 4) + '••••••••••••••••••••••••••••••'
    }));
  },
  
  // Get API key by ID
  getApiKeyById: async (customerId: string, id: string): Promise<ApiKeyResponseType | null> => {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        customerId
      },
      include: { role: { select: { name: true } } }
    });

    if (!apiKey) {
      return null;
    }

    // Mask the key for security
    return {
      ...convertApiKey(apiKey),
      key: apiKey.key.substring(0, 4) + '••••••••••••••••••••••••••••••'
    };
  },
  
  // Create a new API key
  createApiKey: async (customerId: string, data: CreateApiKeyType): Promise<ApiKeyResponseType> => {
    // Generate a secure API key using crypto
    const key = generateRandomKey();

    // A key's access is governed by an RBAC role. Validate the chosen role
    // belongs to THIS tenant (prevents assigning another tenant's role).
    let roleId: string | null = null;
    if (data.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: data.roleId, customerId },
        select: { id: true }
      });
      if (!role) {
        throw new ApiKeyValidationError('Selected role does not exist for this tenant');
      }
      roleId = role.id;
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        name: data.name,
        key,
        type: data.type,
        customerId,
        roleId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        revoked: false,
        scopes: data.scopes || []
      },
      include: { role: { select: { name: true } } }
    });

    return convertApiKey(apiKey);
  },
  
  // Update an API key
  updateApiKey: async (customerId: string, id: string, data: UpdateApiKeyType): Promise<ApiKeyResponseType | null> => {
    // Check if the API key exists and belongs to the customer
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id,
        customerId
      }
    });
    
    if (!existingKey) {
      return null;
    }
    
    // Update the API key with the provided fields
    const updatedApiKey = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
        ...(data.revoked !== undefined && { revoked: data.revoked }),
        ...(data.scopes !== undefined && { scopes: data.scopes })
      }
    });
    
    return {
      ...convertApiKey(updatedApiKey),
      key: updatedApiKey.key.substring(0, 4) + '••••••••••••••••••••••••••••••'
    };
  },
  
  // Regenerate an API key
  regenerateApiKey: async (customerId: string, id: string, options?: RegenerateApiKeyType): Promise<ApiKeyResponseType | null> => {
    // Check if the API key exists and belongs to the customer
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id,
        customerId
      }
    });
    
    if (!existingKey) {
      return null;
    }
    
    // Generate a new API key
    const newKey = generateRandomKey();
    
    // Prepare update data
    const updateData: any = {
      key: newKey,
      revoked: false // Reset revoked status
    };
    
    // Update name if requested
    if (options?.retainName === false) {
      updateData.name = `${existingKey.name} (regenerated)`;
    }
    
    // Update expiration if provided
    if (options?.expiresAt !== undefined) {
      updateData.expiresAt = options.expiresAt ? new Date(options.expiresAt) : null;
    }
    
    // Update the API key
    const updatedApiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData
    });
    
    return convertApiKey(updatedApiKey);
  },
  
  // Delete an API key
  deleteApiKey: async (customerId: string, id: string): Promise<boolean> => {
    // Check if the API key exists and belongs to the customer
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        customerId
      }
    });
    
    if (!apiKey) {
      return false;
    }
    
    // Delete the API key
    await prisma.apiKey.delete({
      where: { id }
    });
    
    return true;
  },
  
  // Revoke an API key
  revokeApiKey: async (customerId: string, id: string): Promise<ApiKeyResponseType | null> => {
    // Check if the API key exists and belongs to the customer
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id,
        customerId
      }
    });
    
    if (!apiKey) {
      return null;
    }
    
    // Revoke the API key
    const revokedApiKey = await prisma.apiKey.update({
      where: { id },
      data: { revoked: true }
    });
    
    return {
      ...convertApiKey(revokedApiKey),
      key: revokedApiKey.key.substring(0, 4) + '••••••••••••••••••••••••••••••'
    };
  },
  
  // Check if an API key is valid
  verifyApiKey: async (key: string): Promise<boolean> => {
    try {
      loggerService.debug('API KEY SERVICE: Verifying API key', {
        keyPreview: key ? key.substring(0, 4) + '••••••' : 'none'
      });
      
      // Print out database URL for debugging
      loggerService.debug('Database connection check', {
        dbUrlPreview: (process.env.DATABASE_URL_VL || '').substring(0, 10) + '...'
      });
      
      // Find the API key
      loggerService.debug('Looking up API key in database');
      const apiKey = await prisma.apiKey.findUnique({
        where: { key }
      });
      
      if (!apiKey) {
        loggerService.warn('API KEY SERVICE: API key not found in database');
        return false;
      }
      loggerService.debug('API KEY SERVICE: Found API key in database', { apiKeyId: apiKey.id });
      
      // Check if the key is revoked
      if (apiKey.revoked) {
        loggerService.warn('API KEY SERVICE: API key is revoked', { apiKeyId: apiKey.id });
        return false;
      }
      
      // Check if the key is expired
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        loggerService.warn('API KEY SERVICE: API key is expired', { 
          apiKeyId: apiKey.id,
          expiredAt: apiKey.expiresAt.toISOString()
        });
        return false;
      }
      
      // Log key details for debugging
      loggerService.debug('API KEY SERVICE: API key details', {
        id: apiKey.id,
        type: apiKey.type,
        scopes: apiKey.scopes,
        ownership: (apiKey as any).ownership || 'tenant'
      });
      
      // Update last used timestamp
      try {
        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsed: new Date() }
        });
        loggerService.debug('API KEY SERVICE: Updated last used timestamp');
      } catch (updateError) {
        loggerService.error('Error updating last used timestamp:', updateError);
        // Continue anyway, this isn't critical
      }
      
      loggerService.info('API KEY SERVICE: API key verification successful', { apiKeyId: apiKey.id });
      return true;
    } catch (error) {
      loggerService.error('Error verifying API key:', error);
      return false;
    }
  },
  
  // Get API key details for authentication
  getApiKeyDetails: async (key: string, id?: string): Promise<{ customerId: string, type: string, scopes: string[], ownership: string, roleId: string | null } | null> => {
    try {
      let apiKey;
      
      // If an ID is provided, use it along with the key for more secure lookup
      if (id) {
        loggerService.debug('Looking up API key with ID and key', { 
          id,
          keyPreview: key.substring(0, 4) + '...'
        });
        apiKey = await prisma.$queryRaw`
          SELECT 
            "customerId", 
            "type", 
            "revoked", 
            "expiresAt", 
            "scopes", 
            "ownership", 
            "roleId" 
          FROM "ApiKey" 
          WHERE "key" = ${key} AND "id" = ${id}
        `;
      } else {
        // Fallback to looking up by key only
        loggerService.debug('Looking up API key with key only', { 
          keyPreview: key.substring(0, 4) + '...'
        });
        apiKey = await prisma.$queryRaw`
          SELECT 
            "customerId", 
            "type", 
            "revoked", 
            "expiresAt", 
            "scopes", 
            "ownership", 
            "roleId" 
          FROM "ApiKey" 
          WHERE "key" = ${key}
        `;
      }
      
      // apiKey will be an array with a single item (or empty)
      if (!apiKey || !Array.isArray(apiKey) || apiKey.length === 0) {
        return null;
      }
      
      const apiKeyData = apiKey[0];
      
      // Check if the key is revoked
      if (apiKeyData.revoked) {
        return null;
      }
      
      // Check if the key is expired
      if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
        return null;
      }
      
      // Update last used timestamp
      await prisma.$executeRaw`
        UPDATE "ApiKey" 
        SET "lastUsed" = NOW() 
        WHERE "key" = ${key}
      `;
      
      return {
        customerId: apiKeyData.customerId,
        type: apiKeyData.type,
        scopes: apiKeyData.scopes || [],
        ownership: apiKeyData.ownership || 'tenant',
        roleId: apiKeyData.roleId || null
      };
    } catch (error) {
      loggerService.error('Error getting API key details:', error);
      return null;
    }
  },

  // Resolve the identity a key authenticates as: its role + the permissions that
  // role grants (used by the API-key auth/whoami endpoints). When the key has no
  // explicit scopes, the effective scopes ARE the role's permissions — so
  // `veltrix whoami` shows what the key can actually do.
  buildKeyIdentity: async (keyDetails: {
    customerId: string;
    type: string;
    scopes: string[];
    ownership: string;
    roleId: string | null;
  }): Promise<ApiKeyIdentity> => {
    let role: string | null = null;
    let permissions: string[] = [];

    if (keyDetails.roleId) {
      const [roleRow, perms] = await Promise.all([
        prisma.role.findUnique({ where: { id: keyDetails.roleId }, select: { name: true } }),
        getRolePermissions(keyDetails.roleId)
      ]);
      role = roleRow?.name ?? null;
      permissions = perms.map((p) =>
        p.appId ? `${p.resource}:${p.action}@${p.appId}` : `${p.resource}:${p.action}`
      );
    }

    const scopes = keyDetails.scopes && keyDetails.scopes.length > 0 ? keyDetails.scopes : permissions;

    return {
      customerId: keyDetails.customerId,
      type: keyDetails.type,
      ownership: keyDetails.ownership,
      role,
      permissions,
      scopes
    };
  }
};

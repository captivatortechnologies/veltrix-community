/**
 * API Key Rotation Service
 * 
 * Provides functionality for managing API key lifecycles including:
 * - Expiration tracking and monitoring
 * - Automatic rotation policies
 * - Expiration alerts and notifications
 * - Rotation history tracking
 * 
 * Security Best Practices:
 * - API keys should expire after 90 days (default)
 * - Alerts sent 30, 14, 7, and 1 day before expiration
 * - Automatic rotation available for critical systems
 * - Rotation history maintained for audit purposes
 */

import prisma from '../../db';
import { loggerService } from '../logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from './credential.service';

// API Key rotation configuration
export interface ApiKeyRotationConfig {
  /** Number of days until expiration (default: 90) */
  expirationDays: number;
  
  /** Days before expiration to send alerts (default: [30, 14, 7, 1]) */
  alertDays: number[];
  
  /** Enable automatic rotation (default: false) */
  autoRotate: boolean;
  
  /** Grace period after expiration before key is disabled (default: 7 days) */
  gracePeriodDays: number;
}

// Default rotation configuration
const DEFAULT_CONFIG: ApiKeyRotationConfig = {
  expirationDays: 90,
  alertDays: [30, 14, 7, 1],
  autoRotate: false,
  gracePeriodDays: 7,
};

// API Key status enum
export enum ApiKeyStatus {
  ACTIVE = 'active',
  EXPIRING_SOON = 'expiring_soon', // Within alert window
  EXPIRED = 'expired',
  ROTATED = 'rotated',
  REVOKED = 'revoked',
}

// API Key metadata
export interface ApiKeyMetadata {
  id: string;
  name: string;
  toolId: string;
  customerId: string;
  status: ApiKeyStatus;
  createdAt: Date;
  expiresAt: Date | null;
  lastRotatedAt: Date | null;
  daysUntilExpiration: number | null;
  alertsSent: number[];
  isAutoRotateEnabled: boolean;
}

// Rotation history entry
export interface RotationHistoryEntry {
  id: string;
  credentialId: string;
  oldKeyHash: string;
  newKeyHash: string;
  rotatedAt: Date;
  rotatedBy: string; // user ID or 'system' for auto-rotation
  reason: string;
}

export const apiKeyRotationService = {
  /**
   * Generate a secure API key
   * @returns A cryptographically secure random API key
   */
  generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Hash an API key for storage in rotation history
   * @param apiKey The API key to hash
   * @returns SHA-256 hash of the key
   */
  hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  },

  /**
   * Calculate expiration date based on configuration
   * @param config Rotation configuration
   * @returns Expiration date
   */
  calculateExpirationDate(config: Partial<ApiKeyRotationConfig> = {}): Date {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + mergedConfig.expirationDays);
    return expirationDate;
  },

  /**
   * Calculate days until expiration
   * @param expiresAt Expiration date
   * @returns Number of days until expiration (negative if expired)
   */
  calculateDaysUntilExpiration(expiresAt: Date | null): number | null {
    if (!expiresAt) return null;
    
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  },

  /**
   * Determine API key status based on expiration
   * @param expiresAt Expiration date
   * @param config Rotation configuration
   * @returns Current status
   */
  determineStatus(
    expiresAt: Date | null,
    config: Partial<ApiKeyRotationConfig> = {}
  ): ApiKeyStatus {
    if (!expiresAt) return ApiKeyStatus.ACTIVE;
    
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const daysUntilExpiration = this.calculateDaysUntilExpiration(expiresAt);
    
    if (daysUntilExpiration === null) return ApiKeyStatus.ACTIVE;
    if (daysUntilExpiration < 0) return ApiKeyStatus.EXPIRED;
    if (daysUntilExpiration <= Math.max(...mergedConfig.alertDays)) {
      return ApiKeyStatus.EXPIRING_SOON;
    }
    
    return ApiKeyStatus.ACTIVE;
  },

  /**
   * Get all API keys (credentials) with expiration metadata
   * @param customerId Optional customer filter
   * @returns Array of API key metadata
   */
  async getAllApiKeys(customerId?: string): Promise<ApiKeyMetadata[]> {
    try {
      const whereClause: any = {
        type: 'API_KEY',
      };
      
      if (customerId) {
        whereClause.customerId = customerId;
      }
      
      const credentials = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        toolId: string;
        customerId: string;
        createdAt: Date;
        expiry: Date | null;
        autoRotate: boolean | null;
      }>>`
        SELECT id, name, "toolId", "customerId", "createdAt", expiry, "autoRotate"
        FROM "Credential"
        WHERE type = 'API_KEY'
        ${customerId ? prisma.$queryRawUnsafe`AND "customerId" = ${customerId}` : prisma.$queryRawUnsafe``}
        ORDER BY expiry ASC NULLS LAST
      `;
      
      return credentials.map(cred => {
        const daysUntilExpiration = this.calculateDaysUntilExpiration(cred.expiry);
        const status = this.determineStatus(cred.expiry);
        
        return {
          id: cred.id,
          name: cred.name,
          toolId: cred.toolId,
          customerId: cred.customerId,
          status,
          createdAt: cred.createdAt,
          expiresAt: cred.expiry,
          lastRotatedAt: null, // TODO: Get from rotation history
          daysUntilExpiration,
          alertsSent: [], // TODO: Get from alert history
          isAutoRotateEnabled: cred.autoRotate || false,
        };
      });
    } catch (error) {
      loggerService.error('Error fetching API keys for rotation tracking', error);
      throw error;
    }
  },

  /**
   * Get API keys expiring soon (within alert window)
   * @param customerId Optional customer filter
   * @returns Array of expiring API keys
   */
  async getExpiringApiKeys(customerId?: string): Promise<ApiKeyMetadata[]> {
    const allKeys = await this.getAllApiKeys(customerId);
    return allKeys.filter(
      key => key.status === ApiKeyStatus.EXPIRING_SOON || key.status === ApiKeyStatus.EXPIRED
    );
  },

  /**
   * Get API keys that need alerts sent
   * @param customerId Optional customer filter
   * @returns Array of API keys needing alerts
   */
  async getApiKeysNeedingAlerts(customerId?: string): Promise<ApiKeyMetadata[]> {
    const allKeys = await this.getAllApiKeys(customerId);
    const config = DEFAULT_CONFIG;
    
    return allKeys.filter(key => {
      if (!key.daysUntilExpiration) return false;
      
      // Check if days until expiration matches any alert threshold
      return config.alertDays.includes(key.daysUntilExpiration) &&
        !key.alertsSent.includes(key.daysUntilExpiration);
    });
  },

  /**
   * Rotate an API key (create new key, mark old as rotated)
   * @param credentialId Credential ID to rotate
   * @param rotatedBy User ID or 'system'
   * @param reason Reason for rotation
   * @returns New API key (only returned once, not stored)
   */
  async rotateApiKey(
    credentialId: string,
    rotatedBy: string,
    reason: string
  ): Promise<{ newApiKey: string; expiresAt: Date }> {
    try {
      // Get existing credential
      const existingCred = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        apiToken: string;
        toolId: string;
        customerId: string;
        autoRotate: boolean | null;
      }>>`
        SELECT id, name, "apiToken", "toolId", "customerId", "autoRotate"
        FROM "Credential"
        WHERE id = ${credentialId} AND type = 'API_KEY'
      `;
      
      if (!existingCred || existingCred.length === 0) {
        throw new Error('API key credential not found');
      }
      
      const cred = existingCred[0];
      
      // Generate new API key
      const newApiKey = this.generateApiKey();
      const newExpiresAt = this.calculateExpirationDate();

      // Hash old and new keys for history — over the PLAINTEXT key. The stored
      // apiToken is encrypted at rest, so decrypt the old one before hashing so
      // the history hash is a stable fingerprint of the actual key.
      const oldKeyHash = this.hashApiKey(decryptSecret(cred.apiToken) ?? cred.apiToken);
      const newKeyHash = this.hashApiKey(newApiKey);

      // Store the new key encrypted at rest (never plaintext).
      const encryptedNewApiKey = encryptSecret(newApiKey);

      // Update credential with new key and expiration
      await prisma.$executeRaw`
        UPDATE "Credential"
        SET "apiToken" = ${encryptedNewApiKey},
            expiry = ${newExpiresAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${credentialId}
      `;
      
      // Create rotation history entry
      const historyId = uuidv4();
      await prisma.$executeRaw`
        INSERT INTO "ApiKeyRotationHistory" (
          id, "credentialId", "oldKeyHash", "newKeyHash", 
          "rotatedAt", "rotatedBy", reason
        )
        VALUES (
          ${historyId}, ${credentialId}, ${oldKeyHash}, ${newKeyHash},
          CURRENT_TIMESTAMP, ${rotatedBy}, ${reason}
        )
      `;
      
      loggerService.info(`API key rotated for credential ${credentialId}`, {
        credentialId,
        rotatedBy,
        reason,
        newExpiresAt,
      });
      
      return { newApiKey, expiresAt: newExpiresAt };
    } catch (error) {
      loggerService.error('Error rotating API key', error);
      throw error;
    }
  },

  /**
   * Enable automatic rotation for an API key
   * @param credentialId Credential ID
   */
  async enableAutoRotation(credentialId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "Credential"
        SET "autoRotate" = true,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${credentialId} AND type = 'API_KEY'
      `;
      
      loggerService.info(`Auto-rotation enabled for credential ${credentialId}`);
    } catch (error) {
      loggerService.error('Error enabling auto-rotation', error);
      throw error;
    }
  },

  /**
   * Disable automatic rotation for an API key
   * @param credentialId Credential ID
   */
  async disableAutoRotation(credentialId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "Credential"
        SET "autoRotate" = false,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${credentialId} AND type = 'API_KEY'
      `;
      
      loggerService.info(`Auto-rotation disabled for credential ${credentialId}`);
    } catch (error) {
      loggerService.error('Error disabling auto-rotation', error);
      throw error;
    }
  },

  /**
   * Set expiration date for an API key
   * @param credentialId Credential ID
   * @param expiresAt Expiration date
   */
  async setExpirationDate(credentialId: string, expiresAt: Date): Promise<void> {
    try {
      await prisma.$executeRaw`
        UPDATE "Credential"
        SET expiry = ${expiresAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${credentialId} AND type = 'API_KEY'
      `;
      
      loggerService.info(`Expiration date set for credential ${credentialId}`, {
        credentialId,
        expiresAt,
      });
    } catch (error) {
      loggerService.error('Error setting expiration date', error);
      throw error;
    }
  },

  /**
   * Revoke an API key immediately
   * @param credentialId Credential ID
   * @param revokedBy User ID
   * @param reason Reason for revocation
   */
  async revokeApiKey(credentialId: string, revokedBy: string, reason: string): Promise<void> {
    try {
      // Set expiration to now and disable auto-rotation
      await prisma.$executeRaw`
        UPDATE "Credential"
        SET expiry = CURRENT_TIMESTAMP,
            "autoRotate" = false,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${credentialId} AND type = 'API_KEY'
      `;
      
      loggerService.warn(`API key revoked for credential ${credentialId}`, {
        credentialId,
        revokedBy,
        reason,
      });
    } catch (error) {
      loggerService.error('Error revoking API key', error);
      throw error;
    }
  },

  /**
   * Get rotation history for a credential
   * @param credentialId Credential ID
   * @returns Array of rotation history entries
   */
  async getRotationHistory(credentialId: string): Promise<RotationHistoryEntry[]> {
    try {
      const history = await prisma.$queryRaw<RotationHistoryEntry[]>`
        SELECT id, "credentialId", "oldKeyHash", "newKeyHash", 
               "rotatedAt", "rotatedBy", reason
        FROM "ApiKeyRotationHistory"
        WHERE "credentialId" = ${credentialId}
        ORDER BY "rotatedAt" DESC
      `;
      
      return history;
    } catch (error) {
      loggerService.error('Error fetching rotation history', error);
      return [];
    }
  },

  /**
   * Send expiration alert (placeholder - integrate with notification service)
   * @param apiKey API key metadata
   */
  async sendExpirationAlert(apiKey: ApiKeyMetadata): Promise<void> {
    // TODO: Integrate with notification service (email, Slack, etc.)
    loggerService.warn(`API key expiring soon: ${apiKey.name}`, {
      credentialId: apiKey.id,
      daysUntilExpiration: apiKey.daysUntilExpiration,
      expiresAt: apiKey.expiresAt,
      customerId: apiKey.customerId,
    });
    
    // Record alert sent
    // TODO: Store alert history in database
  },

  /**
   * Run scheduled rotation job (for auto-rotate enabled keys)
   * Should be called by a cron job or scheduler
   */
  async runScheduledRotations(): Promise<void> {
    try {
      loggerService.info('Running scheduled API key rotations...');
      
      // Get all keys with auto-rotate enabled that are expiring soon
      const allKeys = await this.getAllApiKeys();
      const keysToRotate = allKeys.filter(
        key =>
          key.isAutoRotateEnabled &&
          key.daysUntilExpiration !== null &&
          key.daysUntilExpiration <= 7 && // Rotate 7 days before expiration
          key.daysUntilExpiration > 0
      );
      
      for (const key of keysToRotate) {
        try {
          await this.rotateApiKey(key.id, 'system', 'Automatic rotation before expiration');
          
          // Send notification about automatic rotation
          loggerService.info(`Automatically rotated API key: ${key.name}`, {
            credentialId: key.id,
            customerId: key.customerId,
          });
        } catch (error) {
          loggerService.error(`Failed to auto-rotate key ${key.id}`, error);
        }
      }
      
      loggerService.info(`Scheduled rotations complete. Rotated ${keysToRotate.length} keys.`);
    } catch (error) {
      loggerService.error('Error running scheduled rotations', error);
    }
  },

  /**
   * Run scheduled alert job (send expiration warnings)
   * Should be called by a cron job or scheduler
   */
  async runScheduledAlerts(): Promise<void> {
    try {
      loggerService.info('Running scheduled expiration alerts...');
      
      const keysNeedingAlerts = await this.getApiKeysNeedingAlerts();
      
      for (const key of keysNeedingAlerts) {
        try {
          await this.sendExpirationAlert(key);
        } catch (error) {
          loggerService.error(`Failed to send alert for key ${key.id}`, error);
        }
      }
      
      loggerService.info(`Scheduled alerts complete. Sent ${keysNeedingAlerts.length} alerts.`);
    } catch (error) {
      loggerService.error('Error running scheduled alerts', error);
    }
  },
};

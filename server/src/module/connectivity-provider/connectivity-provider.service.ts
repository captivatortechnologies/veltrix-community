import prisma from '../../db';
import { Prisma } from '@prisma/client';
import { loggerService } from '../../module/logger/logger.service';
import { encryptFields, decryptFields } from '../../utils/encryption';
import {
  ConnectivityProviderType,
  CreateConnectivityProviderRequest,
  UpdateConnectivityProviderRequest,
  TestConnectionResponse,
  PROVIDER_TYPES,
  ProviderType
} from './connectivity-provider.schema';
import { getAdapter } from './adapters';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Mask sensitive config values before returning them to the client.
 * Each sensitive field value is replaced with '••••••' + last 4 characters
 * so callers can confirm a value is set without seeing the secret itself.
 */
function maskSensitiveConfig(
  config: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const masked = { ...config };

  for (const field of sensitiveFields) {
    if (typeof masked[field] === 'string' && (masked[field] as string).length > 0) {
      const value = masked[field] as string;
      const tail = value.length >= 4 ? value.slice(-4) : value;
      masked[field] = `••••••${tail}`;
    }
  }

  return masked;
}

/**
 * Validate that a providerType string is one of the registered types.
 */
function assertValidProviderType(providerType: string): asserts providerType is ProviderType {
  if (!PROVIDER_TYPES.includes(providerType as ProviderType)) {
    throw new Error(
      `Invalid providerType "${providerType}". Must be one of: ${PROVIDER_TYPES.join(', ')}`
    );
  }
}

/** Raw Prisma record shape */
type RawProviderRecord = {
  id: string;
  customerId: string;
  providerType: string;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  config: unknown;
  status: string;
  statusMessage: string | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Decrypt the config JSON from a database record.
 * Returns the record with config fields decrypted (for internal use only).
 */
function decryptConfig(record: RawProviderRecord): Record<string, unknown> {
  const config = (record.config ?? {}) as Record<string, unknown>;
  const adapter = getAdapter(record.providerType);
  return decryptFields(config, adapter.getSensitiveFields());
}

/**
 * Map a raw Prisma record to the public ConnectivityProviderType with
 * sensitive config fields masked (never returns raw secrets to the client).
 */
function toPublicRecord(record: RawProviderRecord): ConnectivityProviderType {
  // First decrypt, then mask — ensures we mask the real value (not the ciphertext)
  const decrypted = decryptConfig(record);
  const adapter = getAdapter(record.providerType);
  const maskedConfig = maskSensitiveConfig(decrypted, adapter.getSensitiveFields());

  return {
    id: record.id,
    customerId: record.customerId,
    providerType: record.providerType as ProviderType,
    name: record.name,
    isDefault: record.isDefault,
    isEnabled: record.isEnabled,
    config: maskedConfig,
    status: record.status as ConnectivityProviderType['status'],
    statusMessage: record.statusMessage,
    lastTestedAt: record.lastTestedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const connectivityProviderService = {
  /**
   * Return all connectivity providers for a customer, with sensitive config
   * fields masked.
   */
  async listProviders(customerId: string): Promise<ConnectivityProviderType[]> {
    loggerService.info('Listing connectivity providers', { customerId });

    const records = await prisma.connectivityProvider.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    return records.map(toPublicRecord);
  },

  /**
   * Return a single connectivity provider, masked.
   * Throws if not found or does not belong to the customer.
   */
  async getProvider(id: string, customerId: string): Promise<ConnectivityProviderType> {
    loggerService.info('Fetching connectivity provider', { id, customerId });

    const record = await prisma.connectivityProvider.findFirst({
      where: { id, customerId }
    });

    if (!record) {
      throw new Error('Connectivity provider not found');
    }

    return toPublicRecord(record);
  },

  /**
   * Create a new connectivity provider.
   * Validates the providerType and the adapter-specific config before writing.
   */
  async createProvider(
    customerId: string,
    data: CreateConnectivityProviderRequest
  ): Promise<ConnectivityProviderType> {
    loggerService.info('Creating connectivity provider', { customerId, providerType: data.providerType });

    assertValidProviderType(data.providerType);

    const adapter = getAdapter(data.providerType);
    const validation = adapter.validateConfig(data.config);

    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join('; ')}`);
    }

    // Encrypt sensitive fields before storing
    const encryptedConfig = encryptFields(data.config, adapter.getSensitiveFields());

    // If this is the first provider of this type, or isDefault is requested,
    // handle the default flag within a transaction.
    const record = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        // Unset isDefault for all other providers of this customer
        await tx.connectivityProvider.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false }
        });
      }

      return tx.connectivityProvider.create({
        data: {
          customerId,
          providerType: data.providerType,
          name: data.name,
          isDefault: data.isDefault ?? false,
          isEnabled: true,
          config: encryptedConfig as Prisma.InputJsonValue,
          status: 'CONFIGURED'
        }
      });
    });

    return toPublicRecord(record);
  },

  /**
   * Update an existing connectivity provider's name, config, or enabled flag.
   */
  async updateProvider(
    id: string,
    customerId: string,
    data: UpdateConnectivityProviderRequest
  ): Promise<ConnectivityProviderType> {
    loggerService.info('Updating connectivity provider', { id, customerId });

    const existing = await prisma.connectivityProvider.findFirst({
      where: { id, customerId }
    });

    if (!existing) {
      throw new Error('Connectivity provider not found');
    }

    let encryptedConfig: Record<string, unknown> | undefined;

    if (data.config !== undefined) {
      const adapter = getAdapter(existing.providerType);
      const validation = adapter.validateConfig(data.config);

      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join('; ')}`);
      }

      // Encrypt sensitive fields before storing
      encryptedConfig = encryptFields(data.config, adapter.getSensitiveFields());
    }

    const updated = await prisma.connectivityProvider.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(encryptedConfig !== undefined && { config: encryptedConfig as Prisma.InputJsonValue }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        // Reset to CONFIGURED when config changes to require a fresh test
        ...(data.config !== undefined && { status: 'CONFIGURED', statusMessage: null })
      }
    });

    return toPublicRecord(updated);
  },

  /**
   * Delete a connectivity provider.
   */
  async deleteProvider(id: string, customerId: string): Promise<{ message: string }> {
    loggerService.info('Deleting connectivity provider', { id, customerId });

    const existing = await prisma.connectivityProvider.findFirst({
      where: { id, customerId }
    });

    if (!existing) {
      throw new Error('Connectivity provider not found');
    }

    await prisma.connectivityProvider.delete({ where: { id } });

    return { message: 'Connectivity provider deleted successfully' };
  },

  /**
   * Mark one provider as the default for a customer.
   * All other providers for the same customer have their isDefault flag cleared.
   */
  async setDefault(id: string, customerId: string): Promise<ConnectivityProviderType> {
    loggerService.info('Setting default connectivity provider', { id, customerId });

    const existing = await prisma.connectivityProvider.findFirst({
      where: { id, customerId }
    });

    if (!existing) {
      throw new Error('Connectivity provider not found');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Clear the default flag on all providers for this customer
      await tx.connectivityProvider.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false }
      });

      // Set this one as default
      return tx.connectivityProvider.update({
        where: { id },
        data: { isDefault: true }
      });
    });

    return toPublicRecord(updated);
  },

  /**
   * Run the adapter's testConnection against the stored (unmasked) config.
   * Updates lastTestedAt, status, and statusMessage on the record.
   */
  async testConnection(id: string, customerId: string): Promise<TestConnectionResponse> {
    loggerService.info('Testing connectivity provider connection', { id, customerId });

    const record = await prisma.connectivityProvider.findFirst({
      where: { id, customerId }
    });

    if (!record) {
      throw new Error('Connectivity provider not found');
    }

    // Decrypt the config so the adapter gets real credentials
    const config = decryptConfig(record);
    const adapter = getAdapter(record.providerType);

    const result = await adapter.testConnection(config);

    // Persist the test outcome
    await prisma.connectivityProvider.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        status: result.success ? 'CONNECTED' : 'ERROR',
        statusMessage: result.message
      }
    });

    return {
      success: result.success,
      message: result.message,
      latencyMs: result.latencyMs
    };
  }
};

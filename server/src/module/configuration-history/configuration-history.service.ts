import prisma from '../../db'; // Adjust path as needed
import { loggerService } from '../logger/logger.service';
import { Prisma } from '@prisma/client'; // Import Prisma types

// Define the type for creating a history entry, matching the schema
// Ensure ConfigActionType is imported or defined if not globally available
// Assuming ConfigActionType enum is defined in schema.prisma and generated
import { ConfigActionType } from '@prisma/client';

interface CreateHistoryEntryInput {
  action: ConfigActionType;
  entityType: string;
  entityId: string;
  entityName?: string;
  details?: Prisma.JsonValue; // Use Prisma.JsonValue for JSON fields
  deployState?: string;
  userId: string;
  customerId: string;
}

interface HistoryFilters {
  action?: ConfigActionType[];
  entityType?: string[];
  entityId?: string;
  userId?: string;
  deployState?: string[];
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface HistoryResponse {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class ConfigurationHistoryService {
  private logger = loggerService;

  /**
   * Create a new configuration history entry
   */
  async createHistoryEntry(data: CreateHistoryEntryInput): Promise<any> {
    try {
      this.logger.info('Creating configuration history entry', { data });
      
      const newEntry = await prisma.configurationHistory.create({
        data: {
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          entityName: data.entityName,
          details: data.details, // Prisma handles JSON conversion
          deployState: data.deployState, // Include deployState for pending approvals
          userId: data.userId,
          customerId: data.customerId,
        },
        include: {
          user: { // Include user details in the response
            select: { id: true, email: true, name: true } 
          }
        }
      });
      
      this.logger.info('Successfully created history entry', { id: newEntry.id });
      return newEntry;
    } catch (error) {
      this.logger.error('Error creating configuration history entry', { error, data });
      // Consider specific error handling (e.g., validation errors)
      throw error;
    }
  }

  /**
   * Update an existing history entry's details (e.g., to amend pending approval with latest changes)
   */
  async updateHistoryEntry(
    id: string,
    data: { details?: Prisma.JsonValue; entityName?: string }
  ): Promise<any> {
    try {
      const updated = await prisma.configurationHistory.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      this.logger.info('Updated history entry', { id });
      return updated;
    } catch (error) {
      this.logger.error('Error updating history entry', { error, id });
      throw error;
    }
  }

  /**
   * Find the most recent pending approval history entry for a specific entity and user
   */
  async findPendingApprovalForUser(
    entityId: string,
    entityType: string,
    userId: string,
    customerId: string
  ): Promise<any | null> {
    try {
      return await prisma.configurationHistory.findFirst({
        where: {
          entityId,
          entityType,
          userId,
          customerId,
          deployState: { in: ['pending_approval', 'pending approval'] },
        },
        orderBy: { timestamp: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
    } catch (error) {
      this.logger.error('Error finding pending approval for user', { error, entityId, userId });
      throw error;
    }
  }

  /**
   * Get configuration history for a customer with filtering and pagination
   */
  async getHistory(
    customerId: string,
    filters?: HistoryFilters,
    pagination?: PaginationParams
  ): Promise<HistoryResponse> {
    try {
      this.logger.info('Fetching configuration history', { customerId, filters, pagination });

      // Build where clause
      const where: Prisma.ConfigurationHistoryWhereInput = { customerId };

      if (filters?.action?.length) {
        where.action = { in: filters.action };
      }

      if (filters?.entityType?.length) {
        where.entityType = { in: filters.entityType };
      }

      if (filters?.entityId) {
        where.entityId = filters.entityId;
      }

      if (filters?.userId) {
        where.userId = filters.userId;
      }

      if (filters?.deployState?.length) {
        where.deployState = { in: filters.deployState };
      }

      if (filters?.startDate || filters?.endDate) {
        where.timestamp = {};
        if (filters.startDate) {
          where.timestamp.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          where.timestamp.lte = new Date(filters.endDate);
        }
      }

      if (filters?.searchTerm) {
        where.OR = [
          { entityName: { contains: filters.searchTerm, mode: 'insensitive' } },
        ];
      }

      // Pagination
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 50;
      const skip = (page - 1) * limit;

      // Get total count
      const total = await prisma.configurationHistory.count({ where });

      // Get paginated results
      const history = await prisma.configurationHistory.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        skip,
        take: limit,
      });

      this.logger.info(`Found ${history.length} history entries for customer ${customerId}`);

      return {
        data: history,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Error fetching configuration history', { error, customerId });
      throw error;
    }
  }

  /**
   * Get a single history entry by ID
   */
  async getHistoryById(id: string, customerId: string): Promise<any | null> {
    try {
      const entry = await prisma.configurationHistory.findFirst({
        where: { id, customerId },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      return entry;
    } catch (error) {
      this.logger.error('Error fetching history entry by ID', { error, id });
      throw error;
    }
  }

  /**
   * Get pending approvals for a customer
   */
  async getPendingApprovals(
    customerId: string,
    entityType?: string,
    entityId?: string
  ): Promise<any[]> {
    try {
      const where: Prisma.ConfigurationHistoryWhereInput = {
        customerId,
        // Match both formats: 'pending_approval' and 'pending approval'
        deployState: { in: ['pending_approval', 'pending approval'] },
      };

      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;

      const approvals = await prisma.configurationHistory.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      this.logger.info(`Found ${approvals.length} pending approvals`);
      return approvals;
    } catch (error) {
      this.logger.error('Error fetching pending approvals', { error, customerId });
      throw error;
    }
  }

  /**
   * Approve a pending change
   */
  async approve(id: string, customerId: string, userId: string): Promise<any> {
    try {
      // Verify the entry exists and is pending
      const entry = await prisma.configurationHistory.findFirst({
        where: { id, customerId, deployState: { in: ['pending_approval', 'pending approval'] } },
      });

      if (!entry) {
        throw new Error('Entry not found or not pending approval');
      }

      // Update the entry to approved
      const updated = await prisma.configurationHistory.update({
        where: { id },
        data: { deployState: 'approved' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      // Create an APPROVED action entry
      await this.createHistoryEntry({
        action: ConfigActionType.APPROVED,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName || undefined,
        details: { approvedEntryId: id },
        userId,
        customerId,
      });

      this.logger.info('Approved configuration change', { id });
      return updated;
    } catch (error) {
      this.logger.error('Error approving configuration change', { error, id });
      throw error;
    }
  }

  /**
   * Reject a pending change
   */
  async reject(
    id: string,
    customerId: string,
    userId: string,
    reason?: string
  ): Promise<any> {
    try {
      // Verify the entry exists and is pending
      const entry = await prisma.configurationHistory.findFirst({
        where: { id, customerId, deployState: { in: ['pending_approval', 'pending approval'] } },
      });

      if (!entry) {
        throw new Error('Entry not found or not pending approval');
      }

      // Update the entry to rejected
      const updated = await prisma.configurationHistory.update({
        where: { id },
        data: { deployState: 'rejected' },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      // Create a REJECTED action entry
      await this.createHistoryEntry({
        action: ConfigActionType.REJECTED,
        entityType: entry.entityType,
        entityId: entry.entityId,
        entityName: entry.entityName || undefined,
        details: { rejectedEntryId: id, reason },
        userId,
        customerId,
      });

      this.logger.info('Rejected configuration change', { id, reason });
      return updated;
    } catch (error) {
      this.logger.error('Error rejecting configuration change', { error, id });
      throw error;
    }
  }

  /**
   * Revert to a previous version
   */
  async revert(
    versionId: string,
    customerId: string,
    userId: string
  ): Promise<{ success: boolean; newVersionId: string }> {
    try {
      // Get the version to revert to
      const targetVersion = await prisma.configurationHistory.findFirst({
        where: { id: versionId, customerId },
      });

      if (!targetVersion) {
        throw new Error('Version not found');
      }

      // Get the value from the target version (use newValue if available, else oldValue)
      const valueToRestore =
        (targetVersion.details as any)?.newValue ||
        (targetVersion.details as any)?.oldValue;

      if (!valueToRestore) {
        throw new Error('No restorable value found in version');
      }

      // Create a REVERTED entry with the restored value
      const newEntry = await this.createHistoryEntry({
        action: ConfigActionType.REVERTED,
        entityType: targetVersion.entityType,
        entityId: targetVersion.entityId,
        entityName: targetVersion.entityName || undefined,
        details: {
          revertedFromId: versionId,
          oldValue: null, // Would need to fetch current value
          newValue: valueToRestore,
        },
        userId,
        customerId,
      });

      this.logger.info('Reverted to version', { versionId, newVersionId: newEntry.id });

      return { success: true, newVersionId: newEntry.id };
    } catch (error) {
      this.logger.error('Error reverting to version', { error, versionId });
      throw error;
    }
  }

  /**
   * Find the most recent pending approval history entry for an entity by a specific user.
   * Used to update an existing approval entry when the user makes changes while pending.
   */
  async findPendingApprovalEntry(
    entityId: string,
    entityType: string,
    userId: string,
    customerId: string
  ): Promise<any | null> {
    try {
      const entry = await prisma.configurationHistory.findFirst({
        where: {
          entityId,
          entityType,
          userId,
          customerId,
          deployState: { in: ['pending_approval', 'pending approval'] },
        },
        orderBy: { timestamp: 'desc' },
      });
      return entry;
    } catch (error) {
      this.logger.error('Error finding pending approval entry', { error, entityId, userId });
      return null;
    }
  }

  /**
   * Update an existing history entry's details (e.g., to reflect new changes on a pending approval).
   */
  async updateHistoryEntryDetails(
    id: string,
    details: Prisma.JsonValue
  ): Promise<any> {
    try {
      const updated = await prisma.configurationHistory.update({
        where: { id },
        data: {
          details,
          timestamp: new Date(), // Bump timestamp so it surfaces as most recent
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });
      this.logger.info('Updated history entry details', { id });
      return updated;
    } catch (error) {
      this.logger.error('Error updating history entry details', { error, id });
      throw error;
    }
  }

  /**
   * Get available entity types for a customer (for filter dropdown)
   */
  async getEntityTypes(customerId: string): Promise<string[]> {
    try {
      const result = await prisma.configurationHistory.findMany({
        where: { customerId },
        select: { entityType: true },
        distinct: ['entityType'],
      });
      return result.map((r) => r.entityType);
    } catch (error) {
      this.logger.error('Error fetching entity types', { error, customerId });
      throw error;
    }
  }

  /**
   * Get available users for a customer (for filter dropdown)
   */
  async getUsers(customerId: string): Promise<any[]> {
    try {
      const result = await prisma.configurationHistory.findMany({
        where: { customerId },
        select: {
          user: { select: { id: true, email: true, name: true } },
        },
        distinct: ['userId'],
      });
      return result.map((r) => r.user);
    } catch (error) {
      this.logger.error('Error fetching users', { error, customerId });
      throw error;
    }
  }
}

export const configurationHistoryService = new ConfigurationHistoryService();

import prisma from '../../db';
import { ConfigCanvasStatus, ConfigActionType, Prisma } from '@prisma/client';

// Define ApprovalStatus type (matches Prisma enum after regeneration)
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
import {
  CreateConfigurationCanvasType,
  UpdateConfigurationCanvasType,
  ListConfigurationCanvasQueryType,
  ConfigurationCanvasSectionType,
  ConfigurationCanvasFieldType,
} from './configuration-canvas.schema';
import { loggerService } from '../logger/logger.service';
import { configurationHistoryService } from '../configuration-history/configuration-history.service';

// Entity type constant for configuration history
const ENTITY_TYPE = 'CONFIGURATION_CANVAS';

// Approval row shape (subset) with the approver's role name, used for role-coverage checks.
type ApprovalWithRole = {
  status: ApprovalStatus;
  approver?: { role?: { name: string } | null } | null;
};

/**
 * Resolve the governing EnvironmentPolicy for a canvas's target environment.
 *
 * The canvas's environment is taken from the approval target environments first, then
 * the canvas's own tags. App-specific policy (`appId = toolType`) wins over the global
 * policy (`appId` null/''). Returns null when no environment or policy is found so
 * callers can fall back to their default (unanimous) behavior.
 */
async function resolveEnvironmentPolicy(
  tx: Prisma.TransactionClient,
  canvasId: string,
  appId: string,
  customerId: string
) {
  // Prefer the target environment attached to the approval request.
  const approvalEnv = await tx.configurationCanvasApprovalEnvironment.findFirst({
    where: { approval: { canvasId } },
    select: { tagId: true },
  });
  let tagId = approvalEnv?.tagId;

  // Fall back to the canvas's own environment tags.
  if (!tagId) {
    const canvasTag = await tx.configurationCanvasTag.findFirst({
      where: { canvasId },
      select: { tagId: true },
    });
    tagId = canvasTag?.tagId;
  }

  if (!tagId) return null;

  // App-specific policy first, then the global (appId null/'') policy.
  const appSpecific = await tx.environmentPolicy.findFirst({
    where: { tagId, customerId, appId },
  });
  if (appSpecific) return appSpecific;

  // Prisma rejects `null` inside an `in` array (PrismaClientValidationError), so
  // match the null/'' global policy with an explicit OR.
  return tx.environmentPolicy.findFirst({
    where: { tagId, customerId, OR: [{ appId: null }, { appId: '' }] },
  });
}

/**
 * True when every required approver role is covered by at least one APPROVED reviewer.
 * An empty requirement list is always satisfied.
 */
function requiredRolesCovered(requiredRoles: string[], approvedRows: ApprovalWithRole[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  const covered = new Set(
    approvedRows
      .map((a) => a.approver?.role?.name)
      .filter((name): name is string => Boolean(name))
  );
  return requiredRoles.every((role) => covered.has(role));
}

export const configurationCanvasService = {
  /**
   * Get all configuration canvases for a customer with pagination
   */
  async getAll(customerId: string, query: ListConfigurationCanvasQueryType) {
    loggerService.info(`Fetching configuration canvases for customer ${customerId}`);

    const { toolType, entityType, status, page, limit, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = {
      customerId,
      ...(toolType && { toolType }),
      ...(entityType && { entityType }),
      ...(status && { status }),
    };

    const [canvases, total] = await Promise.all([
      prisma.configurationCanvas.findMany({
        where,
        include: {
          sections: {
            include: {
              fields: {
                orderBy: { order: 'asc' },
              },
            },
            orderBy: { order: 'asc' },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true } },
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          updatedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.configurationCanvas.count({ where }),
    ]);

    return {
      data: canvases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single configuration canvas by ID
   */
  async getById(id: string, customerId: string) {
    loggerService.info(`Fetching configuration canvas ${id} for customer ${customerId}`);

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      include: {
        sections: {
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        updatedBy: {
          select: { id: true, name: true, email: true },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    return canvas;
  },

  /**
   * Create a new configuration canvas
   */
  async create(data: CreateConfigurationCanvasType, customerId: string, userId: string) {
    loggerService.info(`Creating configuration canvas "${data.name}" for customer ${customerId}`);
    loggerService.info('[ConfigurationCanvasService] Creating - data to save:', {
      name: data.name,
      description: data.description,
      toolType: data.toolType,
      entityType: data.entityType,
      tagIds: data.tagIds,
      sectionsCount: data.sections?.length || 0,
      sections: data.sections,
      customerId,
      userId,
    });

    // Create canvas with sections and fields in a transaction
    const canvas = await prisma.$transaction(async (tx) => {
      // Create the canvas
      const newCanvas = await tx.configurationCanvas.create({
        data: {
          name: data.name,
          description: data.description,
          toolType: data.toolType,
          entityType: data.entityType,
          customerId,
          createdById: userId,
        },
      });

      // Create sections and fields
      if (data.sections && data.sections.length > 0) {
        for (const section of data.sections) {
          const newSection = await tx.configurationCanvasSection.create({
            data: {
              canvasId: newCanvas.id,
              name: section.name,
              icon: section.icon,
              description: section.description,
              collapsed: section.collapsed,
              order: section.order,
            },
          });

          // Create fields for this section
          if (section.fields && section.fields.length > 0) {
            await tx.configurationCanvasField.createMany({
              data: section.fields.map((field) => ({
                sectionId: newSection.id,
                key: field.key,
                label: field.label,
                fieldType: field.fieldType,
                value: field.value !== undefined ? (field.value as Prisma.JsonValue) : Prisma.JsonNull,
                defaultValue: field.defaultValue !== undefined ? (field.defaultValue as Prisma.JsonValue) : Prisma.JsonNull,
                required: field.required,
                placeholder: field.placeholder,
                helpText: field.helpText,
                options: field.options ? (field.options as Prisma.JsonValue) : Prisma.JsonNull,
                validation: field.validation ? (field.validation as Prisma.JsonValue) : Prisma.JsonNull,
                group: field.group,
                order: field.order,
                disabled: field.disabled,
              })),
            });
          }
        }
      }

      // Create tag associations (environments)
      if (data.tagIds && data.tagIds.length > 0) {
        loggerService.info(`Creating ${data.tagIds.length} tag associations for canvas ${newCanvas.id}`);
        try {
          await tx.configurationCanvasTag.createMany({
            data: data.tagIds.map((tagId) => ({
              canvasId: newCanvas.id,
              tagId,
            })),
          });
          loggerService.info(`Tag associations created successfully`);
        } catch (tagError) {
          loggerService.error(`Failed to create tag associations: ${tagError}`);
          throw tagError;
        }
      }

      // Create initial history entry
      const canvasHistory = await tx.configurationCanvasHistory.create({
        data: {
          canvasId: newCanvas.id,
          version: 1,
          action: 'CREATED',
          snapshot: { sections: data.sections || [], tagIds: data.tagIds || [] } as Prisma.JsonObject,
          userId,
          comment: 'Initial creation',
        },
      });

      return { canvas: newCanvas, canvasHistoryId: canvasHistory.id };
    });

    // Log to central configuration history for VersionControlPanel
    try {
      // Convert sections to a flattened format for diff viewing
      const sectionsData = (data.sections || []).reduce((acc, section) => {
        acc[section.name] = (section.fields || []).reduce((fieldAcc, field) => {
          fieldAcc[field.key] = field.value;
          return fieldAcc;
        }, {} as Record<string, unknown>);
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.CREATED,
        entityType: ENTITY_TYPE,
        entityId: canvas.canvas.id,
        entityName: data.name,
        userId,
        customerId,
        deployState: 'draft',
        details: {
          canvasHistoryId: canvas.canvasHistoryId, // Reference to ConfigurationCanvasHistory for restore
          newValue: {
            name: data.name,
            description: data.description,
            toolType: data.toolType,
            entityType: data.entityType,
            ...sectionsData,
          },
          message: 'Configuration canvas created',
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for canvas creation', { historyError, canvasId: canvas.canvas.id });
    }

    // Return the complete canvas
    return this.getById(canvas.canvas.id, customerId);
  },

  /**
   * Update an existing configuration canvas
   */
  async update(id: string, data: UpdateConfigurationCanvasType, customerId: string, userId: string) {
    loggerService.info(`Updating configuration canvas ${id} for customer ${customerId}`);
    loggerService.info('[ConfigurationCanvasService] Updating - data to save:', {
      id,
      name: data.name,
      description: data.description,
      status: data.status,
      tagIds: data.tagIds,
      sectionsCount: data.sections?.length || 0,
      sections: data.sections,
      customerId,
      userId,
    });

    // Check if canvas exists
    const existing = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      include: {
        sections: {
          include: { fields: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true } } },
        },
      },
    });

    if (!existing) {
      throw new Error('Configuration canvas not found');
    }

    // Update in a transaction - capture newVersion for use outside transaction
    const newVersion = existing.version + 1;

    const canvasHistoryId = await prisma.$transaction(async (tx) => {
      // Update canvas metadata
      await tx.configurationCanvas.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          status: data.status,
          version: newVersion,
          updatedById: userId,
        },
      });

      // If sections are provided, replace all sections and fields
      if (data.sections !== undefined) {
        // Delete existing sections (cascade deletes fields)
        await tx.configurationCanvasSection.deleteMany({
          where: { canvasId: id },
        });

        // Create new sections and fields
        for (const section of data.sections) {
          const newSection = await tx.configurationCanvasSection.create({
            data: {
              canvasId: id,
              name: section.name,
              icon: section.icon,
              description: section.description,
              collapsed: section.collapsed,
              order: section.order,
            },
          });

          if (section.fields && section.fields.length > 0) {
            await tx.configurationCanvasField.createMany({
              data: section.fields.map((field) => ({
                sectionId: newSection.id,
                key: field.key,
                label: field.label,
                fieldType: field.fieldType,
                value: field.value !== undefined ? (field.value as Prisma.JsonValue) : Prisma.JsonNull,
                defaultValue: field.defaultValue !== undefined ? (field.defaultValue as Prisma.JsonValue) : Prisma.JsonNull,
                required: field.required,
                placeholder: field.placeholder,
                helpText: field.helpText,
                options: field.options ? (field.options as Prisma.JsonValue) : Prisma.JsonNull,
                validation: field.validation ? (field.validation as Prisma.JsonValue) : Prisma.JsonNull,
                group: field.group,
                order: field.order,
                disabled: field.disabled,
              })),
            });
          }
        }
      }

      // Update tag associations (environments) if provided
      if (data.tagIds !== undefined) {
        // Delete existing tag associations
        await tx.configurationCanvasTag.deleteMany({
          where: { canvasId: id },
        });

        // Create new tag associations
        if (data.tagIds.length > 0) {
          await tx.configurationCanvasTag.createMany({
            data: data.tagIds.map((tagId) => ({
              canvasId: id,
              tagId,
            })),
          });
        }
      }

      // Create history entry
      const canvasHistory = await tx.configurationCanvasHistory.create({
        data: {
          canvasId: id,
          version: newVersion,
          action: 'UPDATED',
          snapshot: {
            sections: data.sections || existing.sections,
            tagIds: data.tagIds !== undefined ? data.tagIds : existing.tags.map(t => t.tagId),
            previousStatus: existing.status,
            newStatus: data.status || existing.status,
          } as Prisma.JsonObject,
          userId,
        },
      });

      return canvasHistory.id;
    });

    // Log to central configuration history for VersionControlPanel
    try {
      // Convert existing sections to a simpler format for diff
      const oldSections = existing.sections.reduce((acc, section) => {
        acc[section.name] = section.fields.reduce((fieldAcc, field) => {
          fieldAcc[field.key] = field.value;
          return fieldAcc;
        }, {} as Record<string, unknown>);
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

      // Convert new sections to the same format
      const newSections = (data.sections || existing.sections).reduce((acc, section) => {
        const sectionData = section as { name: string; fields?: Array<{ key: string; value?: unknown }> };
        acc[sectionData.name] = (sectionData.fields || []).reduce((fieldAcc, field) => {
          fieldAcc[field.key] = field.value;
          return fieldAcc;
        }, {} as Record<string, unknown>);
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

      // Auto-detect all changed fields
      const changedFields: string[] = [];

      // Check metadata changes
      if (data.name && data.name !== existing.name) changedFields.push('name');
      if (data.description !== undefined && data.description !== existing.description) changedFields.push('description');
      if (data.status && data.status !== existing.status) changedFields.push('status');

      // Check section and field changes
      const allSectionNames = new Set([...Object.keys(oldSections), ...Object.keys(newSections)]);
      for (const sectionName of allSectionNames) {
        const oldSection = oldSections[sectionName] || {};
        const newSection = newSections[sectionName] || {};

        // Check if section was added or removed
        if (!oldSections[sectionName]) {
          changedFields.push(sectionName); // Section added
          // Add all fields from the new section
          Object.keys(newSection).forEach(fieldKey => {
            if (!changedFields.includes(fieldKey)) changedFields.push(fieldKey);
          });
        } else if (!newSections[sectionName]) {
          changedFields.push(sectionName); // Section removed
          // Add all fields from the old section
          Object.keys(oldSection).forEach(fieldKey => {
            if (!changedFields.includes(fieldKey)) changedFields.push(fieldKey);
          });
        } else {
          // Compare field values within section
          const allFieldKeys = new Set([...Object.keys(oldSection), ...Object.keys(newSection)]);
          for (const fieldKey of allFieldKeys) {
            const oldValue = oldSection[fieldKey];
            const newValue = newSection[fieldKey];
            // Use JSON stringify for deep comparison
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              if (!changedFields.includes(fieldKey)) changedFields.push(fieldKey);
            }
          }
        }
      }

      // Only create/update history entry if there are actual changes
      if (changedFields.length > 0) {
        const currentStatus = data.status || existing.status;

        // If the canvas is pending approval, update the existing approval entry
        // instead of creating a new one (like pushing new commits to a PR)
        if (currentStatus === ConfigCanvasStatus.PENDING_APPROVAL) {
          const pendingEntry = await configurationHistoryService.findPendingApprovalForUser(
            id, ENTITY_TYPE, userId, customerId
          );

          if (pendingEntry) {
            const existingDetails = (pendingEntry.details || {}) as Record<string, unknown>;
            await configurationHistoryService.updateHistoryEntry(pendingEntry.id, {
              details: {
                ...existingDetails,
                canvasHistoryId,
                newValue: {
                  name: data.name || existing.name,
                  description: data.description !== undefined ? data.description : existing.description,
                  status: currentStatus,
                  ...newSections,
                },
                changedFields,
                message: `Configuration canvas updated (v${existing.version + 1})`,
              },
            });
          } else {
            // No existing pending entry found for this user — create a new one
            await configurationHistoryService.createHistoryEntry({
              action: ConfigActionType.UPDATED,
              entityType: ENTITY_TYPE,
              entityId: id,
              entityName: data.name || existing.name,
              userId,
              customerId,
              deployState: this.statusToDeployState(currentStatus),
              details: {
                canvasHistoryId,
                oldValue: {
                  name: existing.name,
                  description: existing.description,
                  status: existing.status,
                  ...oldSections,
                },
                newValue: {
                  name: data.name || existing.name,
                  description: data.description !== undefined ? data.description : existing.description,
                  status: currentStatus,
                  ...newSections,
                },
                changedFields,
                message: `Configuration canvas updated (v${existing.version + 1})`,
              },
            });
          }
        } else {
          // Normal (non-pending) update — create a new history entry
          await configurationHistoryService.createHistoryEntry({
            action: ConfigActionType.UPDATED,
            entityType: ENTITY_TYPE,
            entityId: id,
            entityName: data.name || existing.name,
            userId,
            customerId,
            deployState: this.statusToDeployState(currentStatus),
            details: {
              canvasHistoryId,
              oldValue: {
                name: existing.name,
                description: existing.description,
                status: existing.status,
                ...oldSections,
              },
              newValue: {
                name: data.name || existing.name,
                description: data.description !== undefined ? data.description : existing.description,
                status: currentStatus,
                ...newSections,
              },
              changedFields,
              message: `Configuration canvas updated (v${existing.version + 1})`,
            },
          });
        }
      }
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for canvas update', { historyError, canvasId: id });
    }

    return this.getById(id, customerId);
  },

  /**
   * Helper: Convert ConfigCanvasStatus to deploy state string
   */
  statusToDeployState(status: ConfigCanvasStatus): string {
    switch (status) {
      case ConfigCanvasStatus.DRAFT:
        return 'draft';
      case ConfigCanvasStatus.PENDING_APPROVAL:
        return 'pending_approval';
      case ConfigCanvasStatus.APPROVED:
        return 'approved';
      case ConfigCanvasStatus.DEPLOYED:
        return 'deployed';
      case ConfigCanvasStatus.CHANGES_REQUESTED:
        return 'rejected';
      case ConfigCanvasStatus.ARCHIVED:
        return 'draft';
      default:
        return 'draft';
    }
  },

  /**
   * Delete a configuration canvas
   */
  async delete(id: string, customerId: string, userId: string) {
    loggerService.info(`Deleting configuration canvas ${id} for customer ${customerId}`);

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    // Only allow deleting draft or archived canvases
    if (canvas.status !== ConfigCanvasStatus.DRAFT && canvas.status !== ConfigCanvasStatus.ARCHIVED) {
      throw new Error('Only draft or archived canvases can be deleted');
    }

    // Store canvas info before deletion for history
    const canvasName = canvas.name;

    await prisma.configurationCanvas.delete({
      where: { id },
    });

    // Log to central configuration history for VersionControlPanel
    try {
      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.DELETED,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvasName,
        userId,
        customerId,
        details: {
          oldValue: {
            name: canvasName,
            status: canvas.status,
            toolType: canvas.toolType,
            entityType: canvas.entityType,
          },
          message: 'Configuration canvas deleted',
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for canvas deletion', { historyError, canvasId: id });
    }

    return true;
  },

  /**
   * Change canvas status (for approval workflow)
   */
  async updateStatus(id: string, status: ConfigCanvasStatus, customerId: string, userId: string, comment?: string) {
    loggerService.info(`Updating status of canvas ${id} to ${status}`);

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    // Validate status transitions
    const validTransitions: Record<ConfigCanvasStatus, ConfigCanvasStatus[]> = {
      DRAFT: [ConfigCanvasStatus.VALIDATION_PENDING, ConfigCanvasStatus.PENDING_APPROVAL, ConfigCanvasStatus.ARCHIVED],
      VALIDATION_PENDING: [ConfigCanvasStatus.PENDING_APPROVAL, ConfigCanvasStatus.VALIDATION_FAILED],
      VALIDATION_FAILED: [ConfigCanvasStatus.DRAFT],
      PENDING_APPROVAL: [ConfigCanvasStatus.APPROVED, ConfigCanvasStatus.DRAFT, ConfigCanvasStatus.CHANGES_REQUESTED],
      CHANGES_REQUESTED: [ConfigCanvasStatus.PENDING_APPROVAL, ConfigCanvasStatus.DRAFT, ConfigCanvasStatus.ARCHIVED],
      APPROVED: [ConfigCanvasStatus.DEPLOYMENT_QUEUED, ConfigCanvasStatus.DEPLOYED, ConfigCanvasStatus.DRAFT],
      DEPLOYMENT_QUEUED: [ConfigCanvasStatus.DEPLOYING, ConfigCanvasStatus.DRAFT],
      DEPLOYING: [ConfigCanvasStatus.DEPLOYED, ConfigCanvasStatus.DEPLOYMENT_FAILED, ConfigCanvasStatus.DEPLOYMENT_PAUSED],
      DEPLOYMENT_PAUSED: [ConfigCanvasStatus.DEPLOYING, ConfigCanvasStatus.DRAFT],
      DEPLOYED: [ConfigCanvasStatus.ARCHIVED, ConfigCanvasStatus.ROLLED_BACK],
      DEPLOYMENT_FAILED: [ConfigCanvasStatus.DRAFT, ConfigCanvasStatus.DEPLOYMENT_QUEUED],
      ROLLED_BACK: [ConfigCanvasStatus.DRAFT, ConfigCanvasStatus.DEPLOYMENT_QUEUED],
      ARCHIVED: [ConfigCanvasStatus.DRAFT],
    };

    if (!validTransitions[canvas.status].includes(status)) {
      throw new Error(`Invalid status transition from ${canvas.status} to ${status}`);
    }

    const newVersion = canvas.version + 1;

    const canvasHistoryId = await prisma.$transaction(async (tx) => {
      await tx.configurationCanvas.update({
        where: { id },
        data: {
          status,
          version: newVersion,
          updatedById: userId,
        },
      });

      // Determine action based on status change
      let action: 'APPROVED' | 'REJECTED' | 'DEPLOYED' | 'UPDATED' = 'UPDATED';
      if (status === ConfigCanvasStatus.APPROVED) action = 'APPROVED';
      else if (status === ConfigCanvasStatus.DEPLOYED) action = 'DEPLOYED';
      else if (status === ConfigCanvasStatus.DRAFT && canvas.status === ConfigCanvasStatus.PENDING_APPROVAL) action = 'REJECTED';

      const canvasHistory = await tx.configurationCanvasHistory.create({
        data: {
          canvasId: id,
          version: newVersion,
          action,
          snapshot: { previousStatus: canvas.status, newStatus: status },
          userId,
          comment,
        },
      });

      return canvasHistory.id;
    });

    // Log to central configuration history for VersionControlPanel
    try {
      // Determine action based on status change
      let historyAction: ConfigActionType = ConfigActionType.UPDATED;
      if (status === ConfigCanvasStatus.APPROVED) historyAction = ConfigActionType.APPROVED;
      else if (status === ConfigCanvasStatus.DEPLOYED) historyAction = ConfigActionType.DEPLOYED;
      else if (status === ConfigCanvasStatus.DRAFT && canvas.status === ConfigCanvasStatus.PENDING_APPROVAL) {
        historyAction = ConfigActionType.REJECTED;
      }

      await configurationHistoryService.createHistoryEntry({
        action: historyAction,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvas.name,
        userId,
        customerId,
        deployState: this.statusToDeployState(status),
        details: {
          canvasHistoryId, // Reference to ConfigurationCanvasHistory for restore
          oldValue: { status: canvas.status },
          newValue: { status },
          changedFields: ['status'],
          message: comment || `Status changed from ${canvas.status} to ${status}`,
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for canvas status update', { historyError, canvasId: id });
    }

    return this.getById(id, customerId);
  },

  /**
   * Submit canvas for approval with designated approvers and target environments
   */
  async submitForApproval(
    id: string,
    approverIds: string[],
    environmentTagIds: string[],
    customerId: string,
    userId: string,
    comment?: string
  ) {
    loggerService.info(`Submitting canvas ${id} for approval with ${approverIds.length} approvers`);

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      include: { sections: { include: { fields: true } } },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    // Allow re-requesting review from CHANGES_REQUESTED (PR "re-request review")
    // in addition to the initial DRAFT submission.
    if (
      canvas.status !== ConfigCanvasStatus.DRAFT &&
      canvas.status !== ConfigCanvasStatus.CHANGES_REQUESTED
    ) {
      throw new Error('Only draft or changes-requested canvases can be submitted for approval');
    }

    if (approverIds.length === 0) {
      throw new Error('At least one approver is required');
    }

    // On a re-request from CHANGES_REQUESTED we PRESERVE prior decisions: reviewers who
    // already approved keep their approval; only the reviewers who requested changes
    // (REJECTED) are reset to PENDING. A fresh DRAFT submission starts from scratch.
    const isReRequest = canvas.status === ConfigCanvasStatus.CHANGES_REQUESTED;

    const newVersion = canvas.version + 1;

    await prisma.$transaction(async (tx) => {
      // Update canvas status to PENDING_APPROVAL
      await tx.configurationCanvas.update({
        where: { id },
        data: {
          status: ConfigCanvasStatus.PENDING_APPROVAL,
          version: newVersion,
          updatedById: userId,
        },
      });

      if (isReRequest) {
        // Preserve existing rows; reset only the rejecting reviewers, add any new approvers.
        const existingApprovals = await tx.configurationCanvasApproval.findMany({
          where: { canvasId: id },
        });
        const existingByApprover = new Map(existingApprovals.map((a) => [a.approverId, a]));

        for (const approverId of approverIds) {
          const existing = existingByApprover.get(approverId);
          if (!existing) {
            const approval = await tx.configurationCanvasApproval.create({
              data: {
                canvasId: id,
                approverId,
                status: 'PENDING' as ApprovalStatus,
                submissionComment: comment,
              },
            });
            if (environmentTagIds.length > 0) {
              await tx.configurationCanvasApprovalEnvironment.createMany({
                data: environmentTagIds.map((tagId) => ({ approvalId: approval.id, tagId })),
              });
            }
          } else if (existing.status === 'REJECTED') {
            // Reset the reviewer who requested changes back to PENDING.
            await tx.configurationCanvasApproval.update({
              where: { id: existing.id },
              data: {
                status: 'PENDING' as ApprovalStatus,
                comment: null,
                respondedAt: null,
                submissionComment: comment,
              },
            });
          }
          // APPROVED / PENDING rows are left untouched.
        }
      } else {
        // Fresh submission: clear any existing approval records for this canvas
        await tx.configurationCanvasApproval.deleteMany({
          where: { canvasId: id },
        });

        // Create approval records for each approver
        for (const approverId of approverIds) {
          const approval = await tx.configurationCanvasApproval.create({
            data: {
              canvasId: id,
              approverId,
              status: 'PENDING' as ApprovalStatus,
              submissionComment: comment,
            },
          });

          // Create environment associations for this approval
          if (environmentTagIds.length > 0) {
            await tx.configurationCanvasApprovalEnvironment.createMany({
              data: environmentTagIds.map((tagId) => ({
                approvalId: approval.id,
                tagId,
              })),
            });
          }
        }
      }

      // Create history entry
      await tx.configurationCanvasHistory.create({
        data: {
          canvasId: id,
          version: newVersion,
          action: 'UPDATED',
          snapshot: {
            previousStatus: canvas.status,
            newStatus: ConfigCanvasStatus.PENDING_APPROVAL,
            approverIds,
            environmentTagIds,
          },
          userId,
          comment: comment || 'Submitted for approval',
        },
      });
    });

    // Log to central configuration history
    try {
      // Flatten canvas sections for diff viewing (same format as update entries)
      const sectionsData = (canvas.sections || []).reduce((acc, section) => {
        acc[section.name] = (section.fields || []).reduce((fieldAcc, field) => {
          fieldAcc[field.key] = field.value;
          return fieldAcc;
        }, {} as Record<string, unknown>);
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

      // Collect all changed fields (sections + their field keys)
      const changedFields: string[] = ['status'];
      for (const [sectionName, fields] of Object.entries(sectionsData)) {
        changedFields.push(sectionName);
        Object.keys(fields).forEach(key => {
          if (!changedFields.includes(key)) changedFields.push(key);
        });
      }

      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.UPDATED,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvas.name,
        userId,
        customerId,
        deployState: 'pending_approval',
        details: {
          oldValue: {
            name: canvas.name,
            description: canvas.description,
            status: canvas.status,
            ...sectionsData,
          },
          newValue: {
            name: canvas.name,
            description: canvas.description,
            status: ConfigCanvasStatus.PENDING_APPROVAL,
            ...sectionsData,
          },
          changedFields,
          approverIds,
          environmentTagIds,
          message: comment || 'Submitted for approval',
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for approval submission', { historyError, canvasId: id });
    }

    return this.getById(id, customerId);
  },

  /**
   * Get approval status for a canvas
   */
  async getApprovals(id: string, customerId: string) {
    loggerService.info(`Fetching approvals for canvas ${id}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    const approvals = await prisma.configurationCanvasApproval.findMany({
      where: { canvasId: id },
      include: {
        approver: {
          select: { id: true, name: true, email: true },
        },
        environments: {
          include: {
            tag: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      canvasId: id,
      canvasStatus: canvas.status,
      approvals: approvals.map((a) => ({
        id: a.id,
        approver: a.approver,
        status: a.status,
        comment: a.comment,
        submissionComment: a.submissionComment,
        respondedAt: a.respondedAt,
        createdAt: a.createdAt,
        environments: a.environments.map((e) => e.tag),
      })),
      summary: {
        total: approvals.length,
        pending: approvals.filter((a) => a.status === 'PENDING').length,
        approved: approvals.filter((a) => a.status === 'APPROVED').length,
        rejected: approvals.filter((a) => a.status === 'REJECTED').length,
      },
    };
  },

  /**
   * Approve a canvas (by an individual approver)
   */
  async approveCanvas(id: string, customerId: string, approverId: string, comment?: string) {
    loggerService.info(`Approver ${approverId} approving canvas ${id}`);

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    if (canvas.status !== ConfigCanvasStatus.PENDING_APPROVAL) {
      throw new Error('Canvas is not pending approval');
    }

    // Find the approval record for this approver
    const approval = await prisma.configurationCanvasApproval.findFirst({
      where: { canvasId: id, approverId },
    });

    if (!approval) {
      throw new Error('You are not an assigned approver for this canvas');
    }

    if (approval.status !== 'PENDING') {
      throw new Error('You have already responded to this approval request');
    }

    await prisma.$transaction(async (tx) => {
      // Update the approval record
      await tx.configurationCanvasApproval.update({
        where: { id: approval.id },
        data: {
          status: 'APPROVED' as ApprovalStatus,
          comment,
          respondedAt: new Date(),
        },
      });

      // Re-read all approvals (with approver role) after this approval.
      const allApprovals = await tx.configurationCanvasApproval.findMany({
        where: { canvasId: id },
        include: { approver: { include: { role: { select: { name: true } } } } },
      });

      // Treat the just-approved row as APPROVED for the decision.
      const effective = allApprovals.map((a) =>
        a.id === approval.id ? { ...a, status: 'APPROVED' as ApprovalStatus } : a
      );
      const approvedRows = effective.filter((a) => a.status === 'APPROVED');
      const anyRejected = effective.some((a) => a.status === 'REJECTED');
      const anyPending = effective.some((a) => a.status === 'PENDING');

      // Resolve the governing EnvironmentPolicy (app-specific first, then global).
      const policy = await resolveEnvironmentPolicy(tx, id, canvas.toolType, customerId);

      let shouldApprove: boolean;
      if (!policy) {
        // Defensive default (no policy): keep the original unanimous behavior.
        shouldApprove = !anyPending && !anyRejected;
      } else {
        const minApprovers = policy.minApprovers ?? 1;
        const rolesCovered = requiredRolesCovered(policy.requiredApproverRoles ?? [], approvedRows);
        shouldApprove = !anyRejected && approvedRows.length >= minApprovers && rolesCovered;
      }

      // If the approval bar is met, update canvas status to APPROVED
      if (shouldApprove) {
        const newVersion = canvas.version + 1;

        await tx.configurationCanvas.update({
          where: { id },
          data: {
            status: ConfigCanvasStatus.APPROVED,
            version: newVersion,
            updatedById: approverId,
          },
        });

        await tx.configurationCanvasHistory.create({
          data: {
            canvasId: id,
            version: newVersion,
            action: 'APPROVED',
            snapshot: { previousStatus: canvas.status, newStatus: ConfigCanvasStatus.APPROVED },
            userId: approverId,
            comment: policy
              ? `Approval threshold met (${approvedRows.length}/${policy.minApprovers ?? 1})`
              : 'All approvers have approved',
          },
        });
      }
    });

    // Log to central configuration history
    try {
      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.APPROVED,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvas.name,
        userId: approverId,
        customerId,
        deployState: 'approved',
        details: {
          message: comment || 'Approved',
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for approval', { historyError, canvasId: id });
    }

    return this.getApprovals(id, customerId);
  },

  /**
   * Reject a canvas (by an individual approver)
   */
  async rejectCanvas(id: string, customerId: string, approverId: string, reason: string) {
    loggerService.info(`Approver ${approverId} rejecting canvas ${id}`);

    if (!reason || reason.trim() === '') {
      throw new Error('Rejection reason is required');
    }

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    if (canvas.status !== ConfigCanvasStatus.PENDING_APPROVAL) {
      throw new Error('Canvas is not pending approval');
    }

    // Find the approval record for this approver
    const approval = await prisma.configurationCanvasApproval.findFirst({
      where: { canvasId: id, approverId },
    });

    if (!approval) {
      throw new Error('You are not an assigned approver for this canvas');
    }

    if (approval.status !== 'PENDING') {
      throw new Error('You have already responded to this approval request');
    }

    const newVersion = canvas.version + 1;

    await prisma.$transaction(async (tx) => {
      // Update the approval record
      await tx.configurationCanvasApproval.update({
        where: { id: approval.id },
        data: {
          status: 'REJECTED' as ApprovalStatus,
          comment: reason,
          respondedAt: new Date(),
        },
      });

      // "Request changes": move the canvas to CHANGES_REQUESTED (not DRAFT) and
      // PRESERVE the other approvers' rows so their prior decisions survive. Only the
      // rejecting reviewer's row was updated above; the author can re-request review.
      await tx.configurationCanvas.update({
        where: { id },
        data: {
          status: ConfigCanvasStatus.CHANGES_REQUESTED,
          version: newVersion,
          updatedById: approverId,
        },
      });

      await tx.configurationCanvasHistory.create({
        data: {
          canvasId: id,
          version: newVersion,
          action: 'REJECTED',
          snapshot: {
            previousStatus: canvas.status,
            newStatus: ConfigCanvasStatus.CHANGES_REQUESTED,
            rejectionReason: reason,
          },
          userId: approverId,
          comment: reason,
        },
      });
    });

    // Log to central configuration history
    try {
      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.REJECTED,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvas.name,
        userId: approverId,
        customerId,
        deployState: 'rejected',
        details: {
          message: reason,
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for rejection', { historyError, canvasId: id });
    }

    return this.getApprovals(id, customerId);
  },

  // ==================== REVIEW COMMENTS ====================

  /**
   * Verify a canvas belongs to the customer (shared ownership scoping for comments).
   */
  async assertCanvasOwnership(id: string, customerId: string) {
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      select: { id: true },
    });
    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }
    return canvas;
  },

  /**
   * Whether a user may modify a comment: its author, or an assigned approver on the canvas.
   */
  async canModifyComment(canvasId: string, commentAuthorId: string, userId: string): Promise<boolean> {
    if (commentAuthorId === userId) return true;
    const approver = await prisma.configurationCanvasApproval.findFirst({
      where: { canvasId, approverId: userId },
      select: { id: true },
    });
    return Boolean(approver);
  },

  /**
   * Get threaded review comments for a canvas. When historyId is provided, only threads
   * anchored to that version are returned (a thread belongs to its root comment's version).
   */
  async getComments(id: string, customerId: string, historyId?: string) {
    loggerService.info(`Fetching comments for canvas ${id}`);
    await this.assertCanvasOwnership(id, customerId);

    const comments = await prisma.configurationCanvasComment.findMany({
      where: { canvasId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    type CommentNode = (typeof comments)[number] & { replies: CommentNode[] };
    const nodeById = new Map<string, CommentNode>();
    comments.forEach((c) => nodeById.set(c.id, { ...c, replies: [] }));

    const roots: CommentNode[] = [];
    for (const c of comments) {
      const node = nodeById.get(c.id)!;
      if (c.parentId && nodeById.has(c.parentId)) {
        nodeById.get(c.parentId)!.replies.push(node);
      } else {
        roots.push(node);
      }
    }

    return historyId ? roots.filter((r) => r.historyId === historyId) : roots;
  },

  /**
   * Add a review comment (optionally anchored to a version and/or a parent for threading).
   */
  async addComment(
    id: string,
    customerId: string,
    userId: string,
    data: { body: string; historyId?: string; parentId?: string }
  ) {
    loggerService.info(`Adding comment to canvas ${id}`);
    await this.assertCanvasOwnership(id, customerId);

    const body = (data.body ?? '').trim();
    if (!body) {
      throw new Error('Comment body is required');
    }

    let resolvedHistoryId: string | null = data.historyId ?? null;

    if (data.parentId) {
      const parent = await prisma.configurationCanvasComment.findFirst({
        where: { id: data.parentId, canvasId: id },
      });
      if (!parent) {
        throw new Error('Parent comment not found');
      }
      // Replies inherit the parent's version anchor when none is supplied.
      if (resolvedHistoryId === null) {
        resolvedHistoryId = parent.historyId;
      }
    }

    if (resolvedHistoryId) {
      const historyEntry = await prisma.configurationCanvasHistory.findFirst({
        where: { id: resolvedHistoryId, canvasId: id },
        select: { id: true },
      });
      if (!historyEntry) {
        throw new Error('Version not found');
      }
    }

    return prisma.configurationCanvasComment.create({
      data: {
        canvasId: id,
        historyId: resolvedHistoryId,
        parentId: data.parentId ?? null,
        userId,
        body,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  /**
   * Update a comment's body and/or resolved flag (author or an assigned approver).
   */
  async updateComment(
    id: string,
    commentId: string,
    customerId: string,
    userId: string,
    data: { body?: string; resolved?: boolean }
  ) {
    loggerService.info(`Updating comment ${commentId} on canvas ${id}`);
    await this.assertCanvasOwnership(id, customerId);

    const comment = await prisma.configurationCanvasComment.findFirst({
      where: { id: commentId, canvasId: id },
    });
    if (!comment) {
      throw new Error('Comment not found');
    }

    const allowed = await this.canModifyComment(id, comment.userId, userId);
    if (!allowed) {
      throw new Error('You are not allowed to update this comment');
    }

    const updateData: { body?: string; resolved?: boolean } = {};
    if (data.body !== undefined) {
      const body = data.body.trim();
      if (!body) {
        throw new Error('Comment body is required');
      }
      updateData.body = body;
    }
    if (data.resolved !== undefined) {
      updateData.resolved = data.resolved;
    }

    return prisma.configurationCanvasComment.update({
      where: { id: commentId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  /**
   * Delete a comment (author or an assigned approver). Replies are detached (parentId
   * is set null by the FK) rather than cascade-deleted.
   */
  async deleteComment(id: string, commentId: string, customerId: string, userId: string) {
    loggerService.info(`Deleting comment ${commentId} on canvas ${id}`);
    await this.assertCanvasOwnership(id, customerId);

    const comment = await prisma.configurationCanvasComment.findFirst({
      where: { id: commentId, canvasId: id },
    });
    if (!comment) {
      throw new Error('Comment not found');
    }

    const allowed = await this.canModifyComment(id, comment.userId, userId);
    if (!allowed) {
      throw new Error('You are not allowed to delete this comment');
    }

    await prisma.configurationCanvasComment.delete({ where: { id: commentId } });
    return true;
  },

  /**
   * Get canvas history/versions
   */
  async getHistory(id: string, customerId: string, limit = 20) {
    loggerService.info(`Fetching history for canvas ${id}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    const history = await prisma.configurationCanvasHistory.findMany({
      where: { canvasId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return history;
  },

  /**
   * Duplicate a canvas
   */
  async duplicate(id: string, newName: string, customerId: string, userId: string) {
    loggerService.info(`Duplicating canvas ${id} as "${newName}"`);

    const original = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      include: {
        sections: {
          include: { fields: true },
        },
      },
    });

    if (!original) {
      throw new Error('Configuration canvas not found');
    }

    // Create duplicate
    return this.create(
      {
        name: newName,
        description: original.description || undefined,
        toolType: original.toolType,
        entityType: original.entityType,
        sections: original.sections.map((section) => ({
          name: section.name,
          icon: section.icon || undefined,
          description: section.description || undefined,
          collapsed: section.collapsed,
          order: section.order,
          fields: section.fields.map((field) => ({
            key: field.key,
            label: field.label,
            fieldType: field.fieldType as ConfigurationCanvasFieldType['fieldType'],
            value: field.value as unknown,
            defaultValue: field.defaultValue as unknown,
            required: field.required,
            placeholder: field.placeholder || undefined,
            helpText: field.helpText || undefined,
            options: field.options as ConfigurationCanvasFieldType['options'],
            validation: field.validation as ConfigurationCanvasFieldType['validation'],
            group: field.group,
            order: field.order,
            disabled: field.disabled,
          })),
        })),
      },
      customerId,
      userId
    );
  },

  /**
   * Export canvas as JSON
   */
  async exportAsJson(id: string, customerId: string) {
    loggerService.info(`Exporting canvas ${id} as JSON`);

    const canvas = await this.getById(id, customerId);

    return {
      name: canvas.name,
      description: canvas.description,
      toolType: canvas.toolType,
      entityType: canvas.entityType,
      sections: canvas.sections.map((section) => ({
        name: section.name,
        icon: section.icon,
        description: section.description,
        fields: section.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.fieldType,
          value: field.value,
        })),
      })),
      exportedAt: new Date().toISOString(),
      version: canvas.version,
    };
  },

  /**
   * Get a specific history entry (version snapshot)
   */
  async getVersion(id: string, historyId: string, customerId: string) {
    loggerService.info(`Fetching version ${historyId} for canvas ${id}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    const historyEntry = await prisma.configurationCanvasHistory.findFirst({
      where: { id: historyId, canvasId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!historyEntry) {
      throw new Error('Version not found');
    }

    return historyEntry;
  },

  /**
   * Restore canvas to a previous version
   */
  async restoreVersion(id: string, historyId: string, customerId: string, userId: string) {
    loggerService.info(`Restoring canvas ${id} to version from history ${historyId}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
      include: {
        sections: { include: { fields: true } },
      },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    // Only allow restoring draft canvases
    if (canvas.status !== ConfigCanvasStatus.DRAFT) {
      throw new Error('Only draft canvases can be restored. Change status to draft first.');
    }

    // Get the history entry to restore from
    const historyEntry = await prisma.configurationCanvasHistory.findFirst({
      where: { id: historyId, canvasId: id },
    });

    if (!historyEntry) {
      throw new Error('Version not found');
    }

    const snapshot = historyEntry.snapshot as { sections?: ConfigurationCanvasSectionType[] } | null;
    if (!snapshot || !snapshot.sections) {
      throw new Error('Version snapshot does not contain sections data');
    }

    // Restore the canvas to the snapshot state
    const newVersion = canvas.version + 1;

    const canvasHistoryId = await prisma.$transaction(async (tx) => {
      // Delete existing sections
      await tx.configurationCanvasSection.deleteMany({
        where: { canvasId: id },
      });

      // Recreate sections from snapshot
      for (const section of snapshot.sections!) {
        const newSection = await tx.configurationCanvasSection.create({
          data: {
            canvasId: id,
            name: section.name,
            icon: section.icon,
            description: section.description,
            collapsed: section.collapsed,
            order: section.order,
          },
        });

        if (section.fields && section.fields.length > 0) {
          await tx.configurationCanvasField.createMany({
            data: section.fields.map((field) => ({
              sectionId: newSection.id,
              key: field.key,
              label: field.label,
              fieldType: field.fieldType,
              value: field.value !== undefined ? (field.value as Prisma.JsonValue) : Prisma.JsonNull,
              defaultValue: field.defaultValue !== undefined ? (field.defaultValue as Prisma.JsonValue) : Prisma.JsonNull,
              required: field.required,
              placeholder: field.placeholder,
              helpText: field.helpText,
              options: field.options ? (field.options as Prisma.JsonValue) : Prisma.JsonNull,
              validation: field.validation ? (field.validation as Prisma.JsonValue) : Prisma.JsonNull,
              group: field.group,
              order: field.order,
              disabled: field.disabled,
            })),
          });
        }
      }

      // Update canvas version
      await tx.configurationCanvas.update({
        where: { id },
        data: {
          version: newVersion,
          updatedById: userId,
        },
      });

      // Create history entry for the restore action
      // Note: 'RESTORED' action was added to ConfigActionType enum in Prisma schema
      // After running `npx prisma generate`, remove the type cast below
      const canvasHistory = await tx.configurationCanvasHistory.create({
        data: {
          canvasId: id,
          version: newVersion,
          action: 'RESTORED' as any, // TODO: Remove cast after prisma generate
          snapshot: { sections: snapshot.sections, restoredFromVersion: historyEntry.version } as Prisma.JsonObject,
          userId,
          comment: `Restored from version ${historyEntry.version}`,
        },
      });

      return canvasHistory.id;
    });

    // Log to central configuration history for VersionControlPanel
    try {
      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.REVERTED,
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: canvas.name,
        userId,
        customerId,
        deployState: 'draft',
        details: {
          canvasHistoryId, // Reference to ConfigurationCanvasHistory for restore
          oldValue: { version: canvas.version },
          newValue: { version: newVersion, restoredFromVersion: historyEntry.version },
          message: `Restored from version ${historyEntry.version}`,
        },
      });
    } catch (historyError) {
      loggerService.error('Failed to create central history entry for canvas restore', { historyError, canvasId: id });
    }

    return this.getById(id, customerId);
  },

  /**
   * Compare two versions (returns diff)
   */
  async compareVersions(id: string, historyId1: string, historyId2: string, customerId: string) {
    loggerService.info(`Comparing versions ${historyId1} and ${historyId2} for canvas ${id}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    // Get both history entries
    const [version1, version2] = await Promise.all([
      prisma.configurationCanvasHistory.findFirst({
        where: { id: historyId1, canvasId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.configurationCanvasHistory.findFirst({
        where: { id: historyId2, canvasId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    if (!version1 || !version2) {
      throw new Error('One or both versions not found');
    }

    const snapshot1 = version1.snapshot as { sections?: ConfigurationCanvasSectionType[] } | null;
    const snapshot2 = version2.snapshot as { sections?: ConfigurationCanvasSectionType[] } | null;

    // Generate diff
    const diff = this.generateDiff(snapshot1?.sections || [], snapshot2?.sections || []);

    return {
      version1: {
        id: version1.id,
        version: version1.version,
        action: version1.action,
        createdAt: version1.createdAt,
        user: version1.user,
      },
      version2: {
        id: version2.id,
        version: version2.version,
        action: version2.action,
        createdAt: version2.createdAt,
        user: version2.user,
      },
      diff,
    };
  },

  /**
   * Generate diff between two section arrays
   */
  generateDiff(
    sections1: ConfigurationCanvasSectionType[],
    sections2: ConfigurationCanvasSectionType[]
  ) {
    const changes: Array<{
      type: 'added' | 'removed' | 'modified';
      path: string;
      oldValue?: unknown;
      newValue?: unknown;
    }> = [];

    // Create maps for easier comparison
    const sections1Map = new Map(sections1.map((s) => [s.name, s]));
    const sections2Map = new Map(sections2.map((s) => [s.name, s]));

    // Find removed sections
    for (const [name, section] of sections1Map) {
      if (!sections2Map.has(name)) {
        changes.push({
          type: 'removed',
          path: `sections/${name}`,
          oldValue: section,
        });
      }
    }

    // Find added sections
    for (const [name, section] of sections2Map) {
      if (!sections1Map.has(name)) {
        changes.push({
          type: 'added',
          path: `sections/${name}`,
          newValue: section,
        });
      }
    }

    // Compare matching sections
    for (const [name, section1] of sections1Map) {
      const section2 = sections2Map.get(name);
      if (section2) {
        // Compare fields
        const fields1Map = new Map((section1.fields || []).map((f) => [f.key, f]));
        const fields2Map = new Map((section2.fields || []).map((f) => [f.key, f]));

        // Removed fields
        for (const [key, field] of fields1Map) {
          if (!fields2Map.has(key)) {
            changes.push({
              type: 'removed',
              path: `sections/${name}/fields/${key}`,
              oldValue: field.value,
            });
          }
        }

        // Added fields
        for (const [key, field] of fields2Map) {
          if (!fields1Map.has(key)) {
            changes.push({
              type: 'added',
              path: `sections/${name}/fields/${key}`,
              newValue: field.value,
            });
          }
        }

        // Modified fields
        for (const [key, field1] of fields1Map) {
          const field2 = fields2Map.get(key);
          if (field2 && JSON.stringify(field1.value) !== JSON.stringify(field2.value)) {
            changes.push({
              type: 'modified',
              path: `sections/${name}/fields/${key}`,
              oldValue: field1.value,
              newValue: field2.value,
            });
          }
        }
      }
    }

    return {
      totalChanges: changes.length,
      added: changes.filter((c) => c.type === 'added').length,
      removed: changes.filter((c) => c.type === 'removed').length,
      modified: changes.filter((c) => c.type === 'modified').length,
      changes,
    };
  },

  /**
   * Add a label/tag to a version
   */
  async labelVersion(id: string, historyId: string, label: string, customerId: string, userId: string) {
    loggerService.info(`Adding label "${label}" to version ${historyId} of canvas ${id}`);

    // Verify canvas belongs to customer
    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id, customerId },
    });

    if (!canvas) {
      throw new Error('Configuration canvas not found');
    }

    const updated = await prisma.configurationCanvasHistory.update({
      where: { id: historyId },
      data: {
        comment: label,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return updated;
  },
};

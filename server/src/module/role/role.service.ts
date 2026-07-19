import prisma from '../../db';
import { loggerService } from '../../module/logger/logger.service';
import {
  getRolePermissions,
  checkPermission,
  isEffectivelyUnrestrictedAdmin,
} from '../../lib/permissions';
import { getResourceCatalog, getResourceActions, type CatalogResource } from './resource-catalog';

export interface Permission {
  id: string;
  resource: string;
  action: string;
  roleId: string;
  appId?: string | null;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  customerId: string;
  permissions?: Permission[];
}

/**
 * Thrown when a request would grant a role permissions the ACTING user does
 * not themselves hold (and the actor isn't already an unrestricted admin).
 * Blocks the privilege-escalation path: a user who is merely granted
 * `role:write` (without `all:all`) must never be able to bootstrap full
 * platform access by editing a role — including their own — to add
 * permissions they don't already have.
 */
export class RoleEscalationError extends Error {
  constructor(public readonly missing: { resource: string; action: string; appId?: string | null }[]) {
    super(
      `Cannot grant permission(s) you do not hold yourself: ${missing
        .map((p) => `${p.resource}:${p.action}${p.appId ? `@${p.appId}` : ''}`)
        .join(', ')}`,
    );
    this.name = 'RoleEscalationError';
  }
}

/**
 * Guard against privilege escalation via role CRUD: unless the acting user
 * is already an unrestricted admin (platform-operator role or `all:all`),
 * every permission they attempt to grant (to ANY role, including their own)
 * must already be satisfied by their own current effective permissions.
 */
async function assertNoEscalation(
  actorRoleId: string,
  requestedPermissions: { resource: string; action: string; appId?: string | null }[],
): Promise<void> {
  if (requestedPermissions.length === 0) return;

  const unrestricted = await isEffectivelyUnrestrictedAdmin(actorRoleId);
  if (unrestricted) return;

  const actorPermissions = await getRolePermissions(actorRoleId);
  const missing = requestedPermissions.filter(
    (p) => !checkPermission(actorPermissions, p.resource, p.action, { appId: p.appId ?? undefined }),
  );

  if (missing.length > 0) {
    throw new RoleEscalationError(missing);
  }
}

export const roleService = {
  // Get all roles for a customer
  async getRoles(customerId: string): Promise<Role[]> {
    try {
      return await prisma.role.findMany({
        where: { customerId },
        include: { permissions: true }
      });
    } catch (error) {
      loggerService.error('Error fetching roles:', error);
      throw new Error('Failed to fetch roles');
    }
  },

  // Get a role by ID
  async getRoleById(roleId: string, customerId: string): Promise<Role | null> {
    try {
      return await prisma.role.findFirst({
        where: { 
          id: roleId,
          customerId
        },
        include: { permissions: true }
      });
    } catch (error) {
      loggerService.error(`Error fetching role with ID ${roleId}:`, error);
      throw new Error(`Failed to fetch role with ID ${roleId}`);
    }
  },

  // Create a new role
  async createRole(
    roleData: {
      name: string;
      description?: string;
      customerId: string;
      // R5: appId is optional — omitted/undefined/null means a
      // platform-scoped permission; a real App.id makes it app-scoped
      // (design decision 1: config types use resource = configTypeId).
      permissions?: { resource: string; action: string; appId?: string | null }[];
    },
    actorRoleId?: string,
  ): Promise<Role> {
    try {
      const { name, description, customerId, permissions = [] } = roleData;

      // Check if role with same name already exists for this customer
      const existingRole = await prisma.role.findFirst({
        where: {
          name,
          customerId
        }
      });

      if (existingRole) {
        throw new Error(`Role with name '${name}' already exists for this customer`);
      }

      // Privilege-escalation guard: the acting user can never grant a role
      // permissions they don't themselves hold, unless they're already an
      // unrestricted admin. actorRoleId is optional only for legacy/internal
      // callers (e.g. seed scripts) that bypass HTTP entirely.
      if (actorRoleId) {
        await assertNoEscalation(actorRoleId, permissions);
      }

      // Create role with permissions
      return await prisma.role.create({
        data: {
          name,
          description,
          customerId,
          permissions: {
            create: permissions.map(p => ({
              resource: p.resource,
              action: p.action,
              appId: p.appId ?? null
            }))
          }
        },
        include: { permissions: true }
      });
    } catch (error) {
      loggerService.error('Error creating role:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to create role');
    }
  },

  // Update a role
  async updateRole(
    roleId: string,
    customerId: string,
    roleData: {
      name?: string;
      description?: string;
      // R5: appId optional — see createRole.
      permissions?: { resource: string; action: string; appId?: string | null }[];
    },
    actorRoleId?: string,
  ): Promise<Role> {
    try {
      const { name, description, permissions } = roleData;

      // Check if role exists and belongs to the customer
      const existingRole = await prisma.role.findFirst({
        where: {
          id: roleId,
          customerId
        }
      });

      if (!existingRole) {
        throw new Error(`Role with ID ${roleId} not found or does not belong to this customer`);
      }

      // Privilege-escalation guard: applies to every role update (including
      // the actor's own role) whenever a permission set is being written.
      // See assertNoEscalation — the actor must already hold everything
      // they're attempting to grant, unless already an unrestricted admin.
      if (actorRoleId && permissions) {
        await assertNoEscalation(actorRoleId, permissions);
      }

      // If name is being updated, check if it conflicts with another role
      if (name && name !== existingRole.name) {
        const nameConflict = await prisma.role.findFirst({
          where: {
            name,
            customerId,
            id: { not: roleId } // Exclude current role
          }
        });

        if (nameConflict) {
          throw new Error(`Role with name '${name}' already exists for this customer`);
        }
      }

      // Update role
      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      // Start a transaction to update role and permissions
      return await prisma.$transaction(async (tx) => {
        // Update role basic info
        const updatedRole = await tx.role.update({
          where: { id: roleId },
          data: updateData,
          include: { permissions: true }
        });

        // If permissions are provided, update them
        if (permissions) {
          // Delete existing permissions
          await tx.permission.deleteMany({
            where: { roleId }
          });

          // Create new permissions
          if (permissions.length > 0) {
            await tx.permission.createMany({
              data: permissions.map(p => ({
                resource: p.resource,
                action: p.action,
                roleId,
                appId: p.appId ?? null
              }))
            });
          }

          // Fetch the updated role with new permissions
          return await tx.role.findUnique({
            where: { id: roleId },
            include: { permissions: true }
          }) as Role;
        }

        return updatedRole;
      });
    } catch (error) {
      loggerService.error(`Error updating role with ID ${roleId}:`, error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to update role with ID ${roleId}`);
    }
  },

  // Delete a role
  async deleteRole(roleId: string, customerId: string): Promise<void> {
    try {
      // Check if role exists and belongs to the customer
      const existingRole = await prisma.role.findFirst({
        where: {
          id: roleId,
          customerId
        }
      });

      if (!existingRole) {
        throw new Error(`Role with ID ${roleId} not found or does not belong to this customer`);
      }

      // Check if any users are using this role
      const usersWithRole = await prisma.user.count({
        where: { roleId }
      });

      if (usersWithRole > 0) {
        throw new Error(`Cannot delete role with ID ${roleId} because it is assigned to ${usersWithRole} user(s)`);
      }

      // Delete role (permissions will be cascade deleted)
      await prisma.role.delete({
        where: { id: roleId }
      });
    } catch (error) {
      loggerService.error(`Error deleting role with ID ${roleId}:`, error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to delete role with ID ${roleId}`);
    }
  },

  // Get available resources — R4: the LIVE catalog (enforced platform
  // resources + the customer's installed apps' declared permissions/config
  // types), replacing the old hardcoded 9-resource placeholder that had
  // drifted from what hasPermission() actually enforces (see
  // resource-catalog.ts for the platform list and drift notes).
  async getResources(customerId: string): Promise<CatalogResource[]> {
    return getResourceCatalog(customerId);
  },

  // Get available actions for a resource, optionally scoped to an app
  // (design decision 1: config types use resource = configTypeId, so the
  // same resource name can mean different things platform- vs app-scoped).
  async getActions(resource: string, customerId: string, appId?: string | null): Promise<string[]> {
    return getResourceActions(resource, customerId, appId);
  }
};

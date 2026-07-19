import { FastifyRequest, FastifyReply } from 'fastify';
import { roleService, RoleEscalationError } from './role.service';
import { loggerService } from '../../module/logger/logger.service';

// Helper to get customer ID from request
const getCustomerId = (request: FastifyRequest): string => {
  const customerId = (request.headers['x-customer-id'] as string) || '';
  if (!customerId) {
    throw new Error('Customer ID is required');
  }
  return customerId;
};

// Helper to get the acting user's roleId (typed request.user, falling back
// to the legacy x-role-id header — same fallback verifyToken relies on).
const getActorRoleId = (request: FastifyRequest): string | undefined => {
  return request.user?.roleId || (request.headers['x-role-id'] as string) || undefined;
};

export const roleController = {
  // Get all roles for the current customer
  async getRoles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const roles = await roleService.getRoles(customerId);
      reply.send(roles);
    } catch (error) {
      loggerService.error('Error in getRoles controller:', error);
      if (error instanceof Error && error.message === 'Customer ID is required') {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to fetch roles' });
      }
    }
  },

  // Get a role by ID
  async getRoleById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const roleId = request.params.id;
      
      const role = await roleService.getRoleById(roleId, customerId);
      
      if (!role) {
        return reply.status(404).send({ error: `Role with ID ${roleId} not found` });
      }
      
      reply.send(role);
    } catch (error) {
      loggerService.error('Error in getRoleById controller:', error);
      if (error instanceof Error && error.message === 'Customer ID is required') {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: `Failed to fetch role with ID ${request.params.id}` });
      }
    }
  },

  // Create a new role
  async createRole(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const body = request.body as {
        name: string;
        description?: string;
        permissions?: { resource: string; action: string }[];
      };
      
      // Validate required fields
      if (!body.name) {
        return reply.status(400).send({ error: 'Role name is required' });
      }
      
      const role = await roleService.createRole(
        {
          ...body,
          customerId
        },
        getActorRoleId(request),
      );

      reply.status(201).send(role);
    } catch (error) {
      loggerService.error('Error in createRole controller:', error);
      if (error instanceof RoleEscalationError) {
        reply.status(403).send({ error: error.message });
      } else if (error instanceof Error) {
        if (error.message === 'Customer ID is required') {
          reply.status(400).send({ error: error.message });
        } else if (error.message.includes('already exists')) {
          reply.status(409).send({ error: error.message });
        } else {
          reply.status(500).send({ error: error.message || 'Failed to create role' });
        }
      } else {
        reply.status(500).send({ error: 'Failed to create role' });
      }
    }
  },

  // Update a role
  async updateRole(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const roleId = request.params.id;
      const body = request.body as {
        name?: string;
        description?: string;
        permissions?: { resource: string; action: string }[];
      };
      
      // Validate that at least one field is being updated
      if (!body.name && body.description === undefined && !body.permissions) {
        return reply.status(400).send({ error: 'At least one field must be provided for update' });
      }
      
      const role = await roleService.updateRole(roleId, customerId, body, getActorRoleId(request));

      reply.send(role);
    } catch (error) {
      loggerService.error('Error in updateRole controller:', error);
      if (error instanceof RoleEscalationError) {
        reply.status(403).send({ error: error.message });
      } else if (error instanceof Error) {
        if (error.message === 'Customer ID is required') {
          reply.status(400).send({ error: error.message });
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('already exists')) {
          reply.status(409).send({ error: error.message });
        } else {
          reply.status(500).send({ error: error.message || `Failed to update role with ID ${request.params.id}` });
        }
      } else {
        reply.status(500).send({ error: `Failed to update role with ID ${request.params.id}` });
      }
    }
  },

  // Delete a role
  async deleteRole(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const roleId = request.params.id;
      
      await roleService.deleteRole(roleId, customerId);
      
      reply.status(204).send();
    } catch (error) {
      loggerService.error('Error in deleteRole controller:', error);
      if (error instanceof Error) {
        if (error.message === 'Customer ID is required') {
          reply.status(400).send({ error: error.message });
        } else if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('assigned to')) {
          // Role is in use by users
          reply.status(409).send({ error: error.message });
        } else {
          reply.status(500).send({ error: error.message || `Failed to delete role with ID ${request.params.id}` });
        }
      } else {
        reply.status(500).send({ error: `Failed to delete role with ID ${request.params.id}` });
      }
    }
  },

  // Get available resources — R4: the live catalog (see role.service).
  async getResources(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = getCustomerId(request);
      const resources = await roleService.getResources(customerId);
      reply.send(resources);
    } catch (error) {
      loggerService.error('Error in getResources controller:', error);
      if (error instanceof Error && error.message === 'Customer ID is required') {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Failed to fetch resources' });
      }
    }
  },

  // Get available actions for a resource. `appId` is an optional query
  // param — pass it to look up an app-scoped resource's actions (design
  // decision 1: config types use resource = configTypeId, so the same
  // resource name can appear both platform- and app-scoped).
  async getActions(
    request: FastifyRequest<{ Params: { resource: string }; Querystring: { appId?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const customerId = getCustomerId(request);
      const resource = request.params.resource;
      const actions = await roleService.getActions(resource, customerId, request.query.appId ?? null);
      reply.send(actions);
    } catch (error) {
      loggerService.error('Error in getActions controller:', {
        error,
        resource: request.params.resource
      });
      if (error instanceof Error && error.message === 'Customer ID is required') {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: `Failed to fetch actions for resource ${request.params.resource}` });
      }
    }
  }
};

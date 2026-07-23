import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../../db';
import { loggerService } from '../logger/logger.service';

interface RequestWithUser extends FastifyRequest {
  user?: {
    id: string;
    customerId: string;
    roleId: string; // Added missing property
    role?: string;  // Added optional role name
  };
}

class ComponentController {
  async getAllComponents(request: RequestWithUser, reply: FastifyReply) {
    if (!request.user || !request.user.customerId) {
      loggerService.warn('Attempted to access components without customer context');
      return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
    }

    const customerId = request.user.customerId;
    loggerService.info(`Fetching all components for customer ID: ${customerId}`);

    try {
      const components = await prisma.component.findMany({
        where: {
          customerId: customerId,
        },
        include: {
          tool: true, // Include related tool information
          tags: { // Include related tags
            select: {
              tag: true // Select the actual tag data
            }
          } 
        },
      });

      // Optional: Transform data if needed before sending
      const transformedComponents = components.map(component => ({
        ...component,
        tags: component.tags.map(t => t.tag) // Flatten tags array
      }));


      reply.send(transformedComponents);
    } catch (error) {
      loggerService.error(`Error fetching components for customer ${customerId}:`, error);
      reply.status(500).send({ error: 'Failed to fetch components' });
    }
  }

  async createComponent(request: RequestWithUser, reply: FastifyReply) {
    if (!request.user || !request.user.customerId) {
      loggerService.warn('Attempted to create component without customer context');
      return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
    }

    const customerId = request.user.customerId;
    
    // Define an interface for the expected request body
    interface CreateComponentBody {
      type: string[]; // Expect an array of strings
      hostname: string;
      port: string;
      webPort?: string | null; // Optional secondary service port (e.g. Splunk Web 8000)
      toolId: string;
      tagIds?: string[];
      domains?: string[]; // Inventory: DNS names this target is reachable at
      ipRanges?: string[]; // Inventory: IP/CIDR ranges this target covers
      // Access Server links: the Connection (credential) used to reach this
      // target, and the ZTNA connectivity provider it is reached through.
      credentialId?: string | null;
      connectivityProviderId?: string | null;
    }
    const componentData = request.body as CreateComponentBody;

    loggerService.info(`Creating component for customer ID: ${customerId}`, componentData);

    try {
      // Basic validation (more robust validation should use schemas)
      if (!componentData.type || componentData.type.length === 0 || !componentData.hostname || !componentData.port || !componentData.toolId) {
        return reply.status(400).send({ error: 'Missing required component fields (type must be a non-empty array, hostname, port, toolId)' });
      }

      const newComponent = await prisma.component.create({
        data: {
          type: componentData.type, // Save the array directly
          hostname: componentData.hostname,
          port: componentData.port,
          webPort: componentData.webPort ?? null,
          domains: componentData.domains ?? [],
          ipRanges: componentData.ipRanges ?? [],
          toolId: componentData.toolId,
          customerId: customerId,
          credentialId: componentData.credentialId ?? null,
          connectivityProviderId: componentData.connectivityProviderId ?? null,
          // Correctly connect to existing tags via the join table
          tags: componentData.tagIds && componentData.tagIds.length > 0 ? {
            create: componentData.tagIds.map((tagId: string) => ({
              tag: { 
                connect: { id: tagId } 
              }
            }))
          } : undefined,
        },
        include: { // Include relations in the returned object
          tool: true,
          tags: { select: { tag: true } }
        }
      });

      // Transform tags for response safely
      const transformedComponent = {
        ...newComponent,
        // Ensure tags exist before mapping
        tags: newComponent.tags ? newComponent.tags.map(t => t.tag) : []
      };

      reply.status(201).send(transformedComponent);
    } catch (error) {
      loggerService.error(`Error creating component for customer ${customerId}:`, error);
      // Check for specific Prisma errors if needed (e.g., foreign key constraint)
      reply.status(500).send({ error: 'Failed to create component' });
    }
  }

  async updateComponent(request: RequestWithUser, reply: FastifyReply) {
    if (!request.user || !request.user.customerId) {
      return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
    }

    const customerId = request.user.customerId;
    const { id } = request.params as { id: string };

    interface UpdateComponentBody {
      type?: string[];
      hostname?: string;
      port?: string;
      webPort?: string | null;
      tagIds?: string[];
      domains?: string[];
      ipRanges?: string[];
      credentialId?: string | null;
      connectivityProviderId?: string | null;
    }
    const updateData = request.body as UpdateComponentBody;

    loggerService.info(`Updating component ${id} for customer ${customerId}`, updateData);

    try {
      // Verify the component belongs to this customer
      const existing = await prisma.component.findFirst({
        where: { id, customerId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Component not found' });
      }

      // Build the update payload
      const data: Record<string, unknown> = {};
      if (updateData.type) data.type = updateData.type;
      if (updateData.hostname) data.hostname = updateData.hostname;
      if (updateData.port) data.port = updateData.port;
      if (updateData.webPort !== undefined) data.webPort = updateData.webPort;
      if (updateData.domains !== undefined) data.domains = updateData.domains;
      if (updateData.ipRanges !== undefined) data.ipRanges = updateData.ipRanges;
      if (updateData.credentialId !== undefined) data.credentialId = updateData.credentialId;
      if (updateData.connectivityProviderId !== undefined) data.connectivityProviderId = updateData.connectivityProviderId;

      // Handle tag updates: clear existing and re-create
      if (updateData.tagIds !== undefined) {
        // Delete existing tag associations
        await prisma.componentTag.deleteMany({ where: { componentId: id } });

        if (updateData.tagIds.length > 0) {
          data.tags = {
            create: updateData.tagIds.map((tagId: string) => ({
              tag: { connect: { id: tagId } },
            })),
          };
        }
      }

      const updated = await prisma.component.update({
        where: { id },
        data,
        include: {
          tool: true,
          tags: { select: { tag: true } },
        },
      });

      const transformedComponent = {
        ...updated,
        tags: updated.tags ? updated.tags.map(t => t.tag) : [],
      };

      reply.send(transformedComponent);
    } catch (error) {
      loggerService.error(`Error updating component ${id}:`, error);
      reply.status(500).send({ error: 'Failed to update component' });
    }
  }

  async deleteComponent(request: RequestWithUser, reply: FastifyReply) {
    if (!request.user || !request.user.customerId) {
      return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
    }

    const customerId = request.user.customerId;
    const { id } = request.params as { id: string };

    loggerService.info(`Deleting component ${id} for customer ${customerId}`);

    try {
      // Verify the component belongs to this customer
      const existing = await prisma.component.findFirst({
        where: { id, customerId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Component not found' });
      }

      // Delete tag associations first, then the component
      await prisma.componentTag.deleteMany({ where: { componentId: id } });
      await prisma.component.delete({ where: { id } });

      reply.status(204).send();
    } catch (error) {
      loggerService.error(`Error deleting component ${id}:`, error);
      reply.status(500).send({ error: 'Failed to delete component' });
    }
  }

  async assignProvider(request: RequestWithUser, reply: FastifyReply) {
    if (!request.user || !request.user.customerId) {
      return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
    }

    const customerId = request.user.customerId;

    interface AssignProviderBody {
      componentIds: string[];
      connectivityProviderId: string | null;
    }
    const { componentIds, connectivityProviderId } = request.body as AssignProviderBody;

    if (!componentIds || componentIds.length === 0) {
      return reply.status(400).send({ error: 'componentIds is required and must be non-empty' });
    }

    try {
      // If assigning (not clearing), verify the provider belongs to this customer
      if (connectivityProviderId) {
        const provider = await prisma.connectivityProvider.findFirst({
          where: { id: connectivityProviderId, customerId },
        });
        if (!provider) {
          return reply.status(404).send({ error: 'Connectivity provider not found' });
        }
      }

      // Update all specified components that belong to this customer
      const result = await prisma.component.updateMany({
        where: {
          id: { in: componentIds },
          customerId,
        },
        data: {
          connectivityProviderId: connectivityProviderId,
        },
      });

      loggerService.info(`Assigned provider ${connectivityProviderId} to ${result.count} components`, { customerId });

      reply.send({ updated: result.count });
    } catch (error) {
      loggerService.error(`Error assigning provider to components:`, error);
      reply.status(500).send({ error: 'Failed to assign connectivity provider' });
    }
  }
}

export const componentController = new ComponentController();

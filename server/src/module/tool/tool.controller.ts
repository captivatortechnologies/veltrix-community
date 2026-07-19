import { FastifyRequest, FastifyReply } from 'fastify';
import { toolService } from './tool.service';
import { 
  ToolCreateRequestType, 
  ToolUpdateRequestType,
  ToolQueryParamsType,
  ToolIdParamsType
} from './tool.schema';
import { loggerService } from '../../module/logger/logger.service';
import prisma from '../../db'; // Import prisma client
import { addPaginationHeaders } from '../../utils/pagination';

// Define interface for request with user context
interface RequestWithUser extends FastifyRequest {
  user?: {
    id: string;
    customerId: string;
    roleId: string;
    role?: string;
  };
}

export const toolController = {
  // Get all tools with optional filtering and pagination
  getAllTools: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const queryParams = request.query as ToolQueryParamsType & { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' };
      
      const result = await toolService.getAllTools(queryParams);
      
      // Add pagination headers
      addPaginationHeaders(reply, result.pagination.page, result.pagination.limit, result.pagination.total);
      
      reply.send(result);
    } catch (error) {
      loggerService.error('Error fetching tools:', error);
      reply.status(500).send({ error: 'Error fetching tools' });
    }
  },
  
  // Get single tool by ID with integrations
  getToolById: async (request: FastifyRequest<{ Params: ToolIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      const tool = await toolService.getToolById(id);
      
      if (!tool) {
        return reply.status(404).send({ error: 'Tool not found' });
      }
      
      reply.send(tool);
    } catch (error) {
      loggerService.error('Error fetching tool:', error);
      reply.status(500).send({ error: 'Error fetching tool' });
    }
  },
  
  // Create a new tool
  createTool: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as ToolCreateRequestType;
      
      const newTool = await toolService.createTool(data);
      reply.status(201).send(newTool);
    } catch (error) {
      loggerService.error('Error creating tool:', error);
      
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error creating tool' });
      }
    }
  },
  
  // Update tool by ID
  updateTool: async (request: FastifyRequest<{ Params: ToolIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const data = request.body as ToolUpdateRequestType;
      
      const updatedTool = await toolService.updateTool(id, data);
      reply.send(updatedTool);
    } catch (error) {
      loggerService.error('Error updating tool:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Record to update not found')) {
          reply.status(404).send({ error: 'Tool not found' });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error updating tool' });
      }
    }
  },
  
  // Delete tool by ID
  deleteTool: async (request: FastifyRequest<{ Params: ToolIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      await toolService.deleteTool(id);
      reply.send({ message: 'Tool deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting tool:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Record to delete does not exist')) {
          reply.status(404).send({ error: 'Tool not found' });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting tool' });
      }
    }
  },
  
  // Get vendors list (for filters)
  getVendors: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.query as { customerId?: string };
      
      const vendors = await toolService.getVendors(customerId);
      reply.send(vendors);
    } catch (error) {
      loggerService.error('Error fetching vendors:', error);
      reply.status(500).send({ error: 'Error fetching vendors' });
    }
  },
  
  // Get categories list (for filters)
  getCategories: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { customerId } = request.query as { customerId?: string };
      
      const categories = await toolService.getCategories(customerId);
      reply.send(categories);
    } catch (error) {
      loggerService.error('Error fetching categories:', error);
      reply.status(500).send({ error: 'Error fetching categories' });
    }
  },

  // Get components associated with a specific tool
  getComponentsByToolId: async (request: RequestWithUser, reply: FastifyReply) => {
    try {
      const { id: toolId } = request.params as { id: string };
      const customerId = request.user?.customerId;

      if (!customerId) {
        loggerService.warn('Attempted to access components by tool ID without customer context');
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }

      loggerService.info(`Fetching components for tool ID: ${toolId} and customer ID: ${customerId}`);

      const components = await prisma.component.findMany({
        where: {
          toolId: toolId,
          customerId: customerId,
        },
        include: {
          // Include other relations if needed, e.g., tags
          tags: {
            select: {
              tag: true
            }
          }
        }
      });

      // Transform data if needed
      const transformedComponents = components.map(component => ({
        ...component,
        tags: component.tags.map(t => t.tag) // Flatten tags array
      }));

      reply.send(transformedComponents);
    } catch (error) {
      loggerService.error(`Error fetching components for tool ID ${ (request.params as any).id }:`, error);
      reply.status(500).send({ error: 'Error fetching components for tool' });
    }
  }
};

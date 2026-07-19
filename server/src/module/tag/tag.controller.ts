import { FastifyRequest, FastifyReply } from 'fastify';
import { tagService } from './tag.service';
import {
  TagCreateRequestType,
  TagUpdateRequestType,
  CustomerIdParamsType,
  TagIdParamsType,
  CustomerTagIdParamsType,
  ProductIdParamsType
} from './tag.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tagController = {
  // Get all tags for a customer
  getAllTags: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const customerId = request.user.customerId;

      const tags = await tagService.getAllTags(customerId);
      reply.send(tags);
    } catch (error) {
      loggerService.error('Error fetching tags:', error);
      reply.status(500).send({ error: 'Error fetching tags' });
    }
  },
  
  // Create a new tag
  createTag: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const data = request.body as TagCreateRequestType;
      const customerId = request.user.customerId;

      const newTag = await tagService.createTag(data, customerId);
      reply.status(201).send(newTag);
    } catch (error) {
      loggerService.error('Error creating tag:', error);

      if (error instanceof Error) {
        if (error.message === 'Tag already exists') {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error creating tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error creating tag' });
      }
    }
  },
  
  // Update tag by ID
  updateTag: async (request: FastifyRequest<{ Params: TagIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { id } = request.params;
      const data = request.body as TagUpdateRequestType;
      const customerId = request.user.customerId;

      const updatedTag = await tagService.updateTag(id, data, customerId);
      reply.send(updatedTag);
    } catch (error) {
      loggerService.error('Error updating tag:', error);

      if (error instanceof Error) {
        if (error.message === 'Tag not found') {
          reply.status(404).send({ error: error.message });
        } else if (error.message === 'Tag with this name already exists') {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error updating tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error updating tag' });
      }
    }
  },
  
  // Delete tag by ID
  deleteTag: async (request: FastifyRequest<{ Params: TagIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { id } = request.params;
      const customerId = request.user.customerId;

      await tagService.deleteTag(id, customerId);
      reply.send({ message: 'Tag deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting tag:', error);

      if (error instanceof Error) {
        if (error.message === 'Tag not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error deleting tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting tag' });
      }
    }
  },
  
  // Get tags by customer ID (admin only)
  getTagsByCustomerId: async (request: FastifyRequest<{ Params: CustomerIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId } = request.params;
      
      const tags = await tagService.getTagsByCustomerId(customerId);
      reply.send(tags);
    } catch (error) {
      loggerService.error('Error fetching tags by customer:', error);
      reply.status(500).send({ error: 'Error fetching tags' });
    }
  },
  
  // Get tags for a specific product
  getTagsByProductId: async (request: FastifyRequest<{ Params: ProductIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { productId } = request.params;
      const customerId = request.user.customerId;

      const tags = await tagService.getTagsByProductId(productId, customerId);
      reply.send(tags);
    } catch (error) {
      loggerService.error('Error fetching tags by product:', error);
      reply.status(500).send({ error: 'Error fetching tags' });
    }
  },
  
  // Get all tags for a customer (with customer ID in URL)
  getAllTagsWithCustomerId: async (request: FastifyRequest<{ Params: CustomerIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId } = request.params;
      
      const tags = await tagService.getAllTags(customerId);
      reply.send(tags);
    } catch (error) {
      loggerService.error('Error fetching tags:', error);
      reply.status(500).send({ error: 'Error fetching tags' });
    }
  },
  
  // Create a new tag for a customer (with customer ID in URL)
  createTagWithCustomerId: async (request: FastifyRequest<{ Params: CustomerIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId } = request.params;
      const data = request.body as TagCreateRequestType;
      
      const newTag = await tagService.createTag(data, customerId);
      reply.status(201).send(newTag);
    } catch (error) {
      loggerService.error('Error creating tag:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Tag already exists') {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error creating tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error creating tag' });
      }
    }
  },
  
  // Update tag by ID for a customer (with customer ID in URL)
  updateTagWithCustomerId: async (request: FastifyRequest<{ Params: CustomerTagIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId, id } = request.params;
      const data = request.body as TagUpdateRequestType;
      
      const updatedTag = await tagService.updateTag(id, data, customerId);
      reply.send(updatedTag);
    } catch (error) {
      loggerService.error('Error updating tag:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Tag not found') {
          reply.status(404).send({ error: error.message });
        } else if (error.message === 'Tag with this name already exists') {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error updating tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error updating tag' });
      }
    }
  },
  
  // Delete tag by ID for a customer (with customer ID in URL)
  deleteTagWithCustomerId: async (request: FastifyRequest<{ Params: CustomerTagIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId, id } = request.params;
      
      await tagService.deleteTag(id, customerId);
      reply.send({ message: 'Tag deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting tag:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Tag not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error deleting tag' });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting tag' });
      }
    }
  }
};

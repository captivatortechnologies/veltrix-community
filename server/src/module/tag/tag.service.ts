import prisma from '../../db';
import { 
  TagCreateRequestType, 
  TagUpdateRequestType,
  TagResponseType
} from './tag.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tagService = {
  // Get all tags for a customer
  async getAllTags(customerId: string): Promise<TagResponseType[]> {
    loggerService.info(`Fetching all tags for customer ID ${customerId}`);
    
    const tags = await prisma.tag.findMany({
      where: { customerId },
      orderBy: { name: 'asc' },
    });
    
    return tags;
  },
  
  // Create a new tag
  async createTag(data: TagCreateRequestType, customerId: string): Promise<TagResponseType> {
    loggerService.info(`Creating tag "${data.name}" for customer ID ${customerId}`);
    
    // Check if tag already exists for this customer
    const existingTag = await prisma.tag.findFirst({
      where: { 
        name: data.name,
        customerId
      },
    });
    
    if (existingTag) {
      throw new Error('Tag already exists');
    }
    
    const newTag = await prisma.tag.create({
      data: { 
        name: data.name,
        customerId
      },
    });
    
    return newTag;
  },
  
  // Update tag by ID
  async updateTag(id: string, data: TagUpdateRequestType, customerId: string): Promise<TagResponseType> {
    loggerService.info(`Updating tag with ID ${id} for customer ID ${customerId}`);
    
    // Check if tag exists and belongs to the customer
    const tagToUpdate = await prisma.tag.findFirst({
      where: { 
        id: id,
        customerId
      },
    });
    
    if (!tagToUpdate) {
      throw new Error('Tag not found');
    }
    
    // Check if tag with new name already exists for this customer
    const existingTag = await prisma.tag.findFirst({
      where: { 
        name: data.name,
        customerId,
        NOT: { id: id }
      },
    });
    
    if (existingTag) {
      throw new Error('Tag with this name already exists');
    }
    
    // Update tag
    const updatedTag = await prisma.tag.update({
      where: { id: id },
      data: { name: data.name },
    });
    
    return updatedTag;
  },
  
  // Delete tag by ID
  async deleteTag(id: string, customerId: string): Promise<boolean> {
    loggerService.info(`Deleting tag with ID ${id} for customer ID ${customerId}`);
    
    // Check if tag exists and belongs to the customer
    const tag = await prisma.tag.findFirst({
      where: { 
        id: id,
        customerId
      }
    });
    
    // Check for related data using separate queries
    const credentialTags = await prisma.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*) as count FROM "CredentialTag" WHERE "tagId" = ${id}
    `;
    
    const componentTags = await prisma.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*) as count FROM "ComponentTag" WHERE "tagId" = ${id}
    `;
    
    // Log related items for reference
    const credentialCount = parseInt(credentialTags[0]?.count || '0', 10);
    const componentCount = parseInt(componentTags[0]?.count || '0', 10);
    
    loggerService.info(`Tag has ${credentialCount} credentials and ${componentCount} components`);
    
    if (!tag) {
      throw new Error('Tag not found');
    }
    
    // Delete tag
    await prisma.tag.delete({
      where: { id: id },
    });
    
    return true;
  },
  
  // Get tags by customer ID (admin only)
  async getTagsByCustomerId(customerId: string): Promise<TagResponseType[]> {
    loggerService.info(`Fetching tags for customer ID ${customerId} (admin)`);
    
    const tags = await prisma.tag.findMany({
      where: { customerId },
      orderBy: { name: 'asc' },
    });
    
    return tags;
  },
  
  // Get tags for a specific product
  async getTagsByProductId(productId: string, customerId: string): Promise<TagResponseType[]> {
    loggerService.info(`Fetching tags for product ID ${productId} and customer ID ${customerId}`);
    
    // This would need to be implemented to filter tags by product
    // For now, just return all tags for the customer
    return this.getAllTags(customerId);
  }
};

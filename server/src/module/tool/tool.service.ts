import prisma from '../../db';
import { 
  ToolCreateRequestType, 
  ToolUpdateRequestType,
  ToolQueryParamsType,
  ToolResponseType
} from './tool.schema';
import { loggerService } from '../../module/logger/logger.service';
import {
  parsePaginationParams,
  calculateSkip,
  buildPaginatedResponse,
  buildOrderBy,
  type PaginatedResponse,
} from '../../utils/pagination';
import { toolWithRelations } from '../../utils/query-optimization';

export const toolService = {
  // Get all tools with optional filtering and pagination
  async getAllTools(queryParams: ToolQueryParamsType & { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<PaginatedResponse<ToolResponseType>> {
    const { page, limit, sortBy, sortOrder } = parsePaginationParams(queryParams);
    const skip = calculateSkip(page, limit);
    const { vendor, category, search, customerId } = queryParams;
    
    loggerService.info(`Fetching tools with filters: ${JSON.stringify(queryParams)}`);
    
    const whereClause: any = {
      isActive: true,
    };
    
    if (category) {
      whereClause.category = category;
    }
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // For vendor filtering, use name since vendor doesn't exist in schema
    if (vendor) {
      whereClause.name = {
        contains: vendor,
        mode: 'insensitive'
      };
    }
    
    // Build the final where clause with customer filter if provided
    if (customerId) {
      whereClause.customerTools = {
        some: {
          customerId: customerId
        }
      };
    }
    
    // Get total count for pagination
    const total = await prisma.tool.count({ where: whereClause });
    
    // Get paginated tools with relations (prevents N+1 queries)
    const tools = await prisma.tool.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: buildOrderBy(sortBy, sortOrder),
      // Temporarily disabled relations to debug
      // include: toolWithRelations.include, // Include all relations in single query
    });
    
    // Transform DB results to match the expected response type
    const data = tools.map(tool => {
      // Set the correct vendor based on the tool name
      let vendor = "Unknown";
      
      if (tool.name.includes("Splunk")) {
        vendor = "Splunk Inc.";
      } else if (tool.name.includes("Microsoft")) {
        vendor = "Microsoft";
      } else if (tool.name.includes("Google")) {
        vendor = "Google";
      } else if (tool.name.includes("AWS")) {
        vendor = "Amazon Web Services";
      } else if (tool.name.includes("Azure")) {
        vendor = "Microsoft";
      } else {
        // Default to using the first part of the name as vendor
        const nameParts = tool.name.split(' ');
        vendor = nameParts[0];
      }
      
      return {
        id: tool.id,
        name: tool.name,
        description: tool.description || "",
        vendor: vendor,
        logoUrl: tool.logoUrl || null,
        category: tool.category || "",
        isActive: tool.isActive,
        createdAt: tool.createdAt,
        updatedAt: tool.updatedAt
      };
    });
    
    // Return paginated response
    return buildPaginatedResponse(data, total, page, limit);
  },
  
  // Get single tool by ID (optimized with relations)
  async getToolById(id: string): Promise<ToolResponseType | null> {
    loggerService.info(`Fetching tool with ID ${id}`);
    
    const tool = await prisma.tool.findUnique({
      where: { id: id },
      include: toolWithRelations.include, // Include all relations in single query
    });
    
    if (!tool) {
      return null;
    }
    
    // Get the correct vendor based on the tool name
    let vendor = "Unknown";
    
    if (tool.name.includes("Splunk")) {
      vendor = "Splunk Inc.";
    } else if (tool.name.includes("Microsoft")) {
      vendor = "Microsoft";
    } else if (tool.name.includes("Google")) {
      vendor = "Google";
    } else if (tool.name.includes("AWS")) {
      vendor = "Amazon Web Services";
    } else if (tool.name.includes("Azure")) {
      vendor = "Microsoft";
    } else {
      // Default to using the first part of the name as vendor
      const nameParts = tool.name.split(' ');
      vendor = nameParts[0];
    }
    
    // Transform DB result to match the expected response type
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description || "",
      vendor: vendor,
      logoUrl: tool.logoUrl || null,
      category: tool.category || "",
      isActive: tool.isActive,
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt
    };
  },
  
  // Create a new tool
  async createTool(data: ToolCreateRequestType): Promise<ToolResponseType> {
    loggerService.info(`Creating tool "${data.name}"`);
    
    // Use regular Prisma create but with raw SQL approach to avoid schema mismatches
    type ToolRecord = {
      id: string;
      name: string;
      description: string | null;
      logoUrl: string | null;
      category: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    
    // Create the tool directly to bypass schema validation
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO "Tool" (
        "id", "name", "description", "logoUrl", "category", "isActive", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING *`,
      data.name, 
      data.description || null,
      data.logoUrl || null,
      data.category || null
    );
    
    // Fetch the created tool
    const newTools = await prisma.$queryRaw<ToolRecord[]>`
      SELECT * FROM "Tool" 
      WHERE "name" = ${data.name} 
      ORDER BY "createdAt" DESC 
      LIMIT 1
    `;
    
    const newTool = newTools[0];
    
    if (!newTool) {
      throw new Error('Failed to create tool');
    }
    
    // If customerId is provided, create a CustomerTool relationship
    if (data.customerId) {
      await prisma.customerTool.create({
        data: {
          customerId: data.customerId,
          toolId: newTool.id
        }
      });
    }
    
    // Get the correct vendor based on the tool name
    let vendor = "Unknown";
    
    if (newTool.name.includes("Splunk")) {
      vendor = "Splunk Inc.";
    } else if (newTool.name.includes("Microsoft")) {
      vendor = "Microsoft";
    } else if (newTool.name.includes("Google")) {
      vendor = "Google";
    } else if (newTool.name.includes("AWS")) {
      vendor = "Amazon Web Services";
    } else if (newTool.name.includes("Azure")) {
      vendor = "Microsoft";
    } else {
      // Default to using the first part of the name as vendor
      const nameParts = newTool.name.split(' ');
      vendor = nameParts[0];
    }
    
    // Transform DB result to match the expected response type
    return {
      id: newTool.id,
      name: newTool.name,
      description: newTool.description || "",
      vendor: vendor,
      logoUrl: newTool.logoUrl || null,
      category: newTool.category || "",
      isActive: newTool.isActive,
      createdAt: newTool.createdAt,
      updatedAt: newTool.updatedAt
    };
  },
  
  // Update tool by ID
  async updateTool(id: string, data: ToolUpdateRequestType): Promise<ToolResponseType> {
    loggerService.info(`Updating tool with ID ${id}`);
    
    // Prepare update data with only fields that exist in the schema
    const updateData: any = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    
    const updatedTool = await prisma.tool.update({
      where: { id: id },
      data: updateData
    });
    
    // If customerId is provided, create a CustomerTool relationship if it doesn't exist
    if (data.customerId) {
      const existingCustomerTool = await prisma.customerTool.findUnique({
        where: {
          customerId_toolId: {
            customerId: data.customerId,
            toolId: id
          }
        }
      });
      
      if (!existingCustomerTool) {
        await prisma.customerTool.create({
          data: {
            customerId: data.customerId,
            toolId: id
          }
        });
      }
    }
    
    // Get the correct vendor based on the tool name
    let vendor = "Unknown";
    
    if (updatedTool.name.includes("Splunk")) {
      vendor = "Splunk Inc.";
    } else if (updatedTool.name.includes("Microsoft")) {
      vendor = "Microsoft";
    } else if (updatedTool.name.includes("Google")) {
      vendor = "Google";
    } else if (updatedTool.name.includes("AWS")) {
      vendor = "Amazon Web Services";
    } else if (updatedTool.name.includes("Azure")) {
      vendor = "Microsoft";
    } else {
      // Default to using the first part of the name as vendor
      const nameParts = updatedTool.name.split(' ');
      vendor = nameParts[0];
    }
    
    // Transform DB result to match the expected response type
    return {
      id: updatedTool.id,
      name: updatedTool.name,
      description: updatedTool.description || "",
      vendor: vendor,
      logoUrl: updatedTool.logoUrl || null,
      category: updatedTool.category || "",
      isActive: updatedTool.isActive,
      createdAt: updatedTool.createdAt,
      updatedAt: updatedTool.updatedAt
    };
  },
  
  // Delete tool by ID
  async deleteTool(id: string): Promise<boolean> {
    loggerService.info(`Deleting tool with ID ${id}`);
    
    try {
      // Use raw query to check for related integrations to avoid schema mismatches
      const result = await prisma.$queryRaw<Array<{ count: string }>>`
        SELECT COUNT(*) as count 
        FROM "Integration" 
        WHERE "toolId" = ${id}
      `;
      
      const integrationCount = parseInt(result[0]?.count || '0', 10);
      
      if (integrationCount > 0) {
        // Soft delete - just mark as inactive
        await prisma.tool.update({
          where: { id: id },
          data: { isActive: false }
        });
      } else {
        // Hard delete if no integrations
        await prisma.tool.delete({
          where: { id: id }
        });
      }
      
      return true;
    } catch (error) {
      loggerService.error(`Error deleting tool: ${error}`);
      return false;
    }
  },
  
  // Get vendors list (for filters)
  async getVendors(customerId?: string): Promise<string[]> {
    loggerService.info(`Fetching vendors list${customerId ? ` for customer ID ${customerId}` : ''}`);
    
    try {
      const whereClause: any = {
        isActive: true
      };
      
      let tools;
      
      // Filter by customer ID if provided
      if (customerId) {
        tools = await prisma.tool.findMany({
          select: { name: true },
          where: {
            ...whereClause,
            customerTools: {
              some: {
                customerId: customerId
              }
            }
          }
        });
      } else {
        tools = await prisma.tool.findMany({
          select: { name: true },
          where: whereClause
        });
      }
      
      // Map tool names to vendor names and remove duplicates
      const vendors = new Set<string>();
      
      tools.forEach(tool => {
        let vendor = "Unknown";
        
        if (tool.name.includes("Splunk")) {
          vendor = "Splunk Inc.";
        } else if (tool.name.includes("Microsoft")) {
          vendor = "Microsoft";
        } else if (tool.name.includes("Google")) {
          vendor = "Google";
        } else if (tool.name.includes("AWS")) {
          vendor = "Amazon Web Services";
        } else if (tool.name.includes("Azure")) {
          vendor = "Microsoft";
        } else {
          // Default to using the first part of the name as vendor
          const nameParts = tool.name.split(' ');
          vendor = nameParts[0];
        }
        
        vendors.add(vendor);
      });
      
      return Array.from(vendors).sort();
    } catch (error) {
      loggerService.error(`Error fetching vendors: ${error}`);
      return [];
    }
  },
  
  // Get categories list (for filters)
  async getCategories(customerId?: string): Promise<string[]> {
    loggerService.info(`Fetching categories list${customerId ? ` for customer ID ${customerId}` : ''}`);
    
    try {
    const whereClause: any = {
      isActive: true,
    };
      
      let tools;
      
      // Filter by customer ID if provided
      if (customerId) {
        tools = await prisma.tool.findMany({
          distinct: ['category'],
          select: { category: true },
          where: {
            ...whereClause,
            customerTools: {
              some: {
                customerId: customerId
              }
            }
          }
        });
      } else {
        tools = await prisma.tool.findMany({
          distinct: ['category'],
          select: { category: true },
          where: whereClause
        });
      }
      
      // Filter out null categories and return as string array
      return tools
        .map(tool => tool.category)
        .filter((category): category is string => category !== null);
    } catch (error) {
      loggerService.error(`Error fetching categories: ${error}`);
      return [];
    }
  }
};

import prisma from '../../db';
import { 
  AddToolBodyType,
  ToolResponseType,
  SuccessMessageType
} from './customer-tool.schema';
import { loggerService } from '../../module/logger/logger.service';

export const customerToolService = {
  // Get all tools configured by a specific customer
  async getCustomerTools(customerId: string): Promise<ToolResponseType[]> {
    loggerService.info(`Fetching tools for customer ID ${customerId}`);
    
    // Verify the organization exists
    const customer = await prisma.organization.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all tools that have components or credentials created by this customer
    const customerTools = await prisma.customerTool.findMany({
      where: { customerId },
      include: {
        tool: true
      }
    });
    
    // Map to return just the tool data
    return customerTools.map(ct => ct.tool) as ToolResponseType[];
  },
  
  // Add a tool to a customer's configured tools
  async addCustomerTool(customerId: string, data: AddToolBodyType): Promise<ToolResponseType> {
    loggerService.info(`Adding tool ${data.toolId} to customer ID ${customerId}`);

    // Verify the organization exists
    const customer = await prisma.organization.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Verify the tool exists
    const tool = await prisma.tool.findUnique({
      where: { id: data.toolId }
    });
    
    if (!tool) {
      throw new Error('Tool not found');
    }
    
    // Check if the customer already has this tool configured
    const existingCustomerTool = await prisma.customerTool.findUnique({
      where: {
        customerId_toolId: {
          customerId,
          toolId: data.toolId
        }
      }
    });
    
    if (existingCustomerTool) {
      throw new Error('Tool already configured for this customer');
    }
    
    // Add the tool to the customer's configured tools
    const customerTool = await prisma.customerTool.create({
      data: {
        customerId,
        toolId: data.toolId
      },
      include: {
        tool: true
      }
    });
    
    return customerTool.tool as ToolResponseType;
  },
  
  // Remove a tool from a customer's configured tools
  async removeCustomerTool(customerId: string, toolId: string): Promise<SuccessMessageType> {
    loggerService.info(`Removing tool ${toolId} from customer ID ${customerId}`);

    // Verify the organization exists
    const customer = await prisma.organization.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Verify the tool exists
    const tool = await prisma.tool.findUnique({
      where: { id: toolId }
    });
    
    if (!tool) {
      throw new Error('Tool not found');
    }
    
    // Check if the customer has this tool configured
    const existingCustomerTool = await prisma.customerTool.findUnique({
      where: {
        customerId_toolId: {
          customerId,
          toolId
        }
      }
    });
    
    if (!existingCustomerTool) {
      throw new Error('Tool not configured for this customer');
    }
    
    // Remove the tool from the customer's configured tools
    await prisma.customerTool.delete({
      where: {
        customerId_toolId: {
          customerId,
          toolId
        }
      }
    });
    
    return { message: 'Tool removed from customer configuration' };
  }
};

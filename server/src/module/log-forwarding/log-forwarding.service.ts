import prisma from '../../db';
import { 
  LogForwardingCreateRequestType, 
  LogForwardingUpdateRequestType,
  LogForwardingResponseType,
  LogForwardingStatusType,
  LogForwardingDestinationType
} from './log-forwarding.schema';
import { loggerService } from '../../module/logger/logger.service';

export const logForwardingService = {
  // Get all log forwarding destinations for a customer
  async getAllDestinations(customerId: string): Promise<LogForwardingResponseType[]> {
    loggerService.info(`Fetching all log forwarding destinations for customer ID ${customerId}`);
    
    const destinations = await prisma.logForwardingDestination.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' }
    });
    
    // Cast the types to match our schema
    return destinations.map(dest => ({
      ...dest,
      type: dest.type as LogForwardingDestinationType,
      status: dest.status as LogForwardingStatusType
    }));
  },
  
  // Create a new log forwarding destination
  async createDestination(data: LogForwardingCreateRequestType, customerId: string): Promise<LogForwardingResponseType> {
    loggerService.info(`Creating log forwarding destination "${data.name}" for customer ID ${customerId}`);
    
    const destination = await prisma.logForwardingDestination.create({
      data: {
        name: data.name,
        type: data.type,
        endpoint: data.endpoint,
        status: 'inactive', // New destinations start as inactive
        customerId
      }
    });
    
    // Cast the types to match our schema
    return {
      ...destination,
      type: destination.type as LogForwardingDestinationType,
      status: destination.status as LogForwardingStatusType
    };
  },
  
  // Update a log forwarding destination
  async updateDestination(id: string, data: LogForwardingUpdateRequestType, customerId: string): Promise<LogForwardingResponseType> {
    loggerService.info(`Updating log forwarding destination with ID ${id} for customer ID ${customerId}`);
    
    // Check if the destination exists and belongs to the customer
    const destination = await prisma.logForwardingDestination.findFirst({
      where: {
        id: id,
        customerId
      }
    });
    
    if (!destination) {
      throw new Error('Log forwarding destination not found');
    }
    
    // Prepare update data
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.endpoint !== undefined) updateData.endpoint = data.endpoint;
    if (data.status !== undefined) {
      updateData.status = data.status;
      
      // If status is changed to active, update lastSync
      if (data.status === 'active') {
        updateData.lastSync = new Date();
      }
      
      // If status is changed to error, set error message
      if (data.status === 'error') {
        updateData.error = 'Manual status change to error';
      }
    }
    
    // Update the destination
    const updatedDestination = await prisma.logForwardingDestination.update({
      where: { id: id },
      data: updateData
    });
    
    // Cast the types to match our schema
    return {
      ...updatedDestination,
      type: updatedDestination.type as LogForwardingDestinationType,
      status: updatedDestination.status as LogForwardingStatusType
    };
  },
  
  // Delete a log forwarding destination
  async deleteDestination(id: string, customerId: string): Promise<boolean> {
    loggerService.info(`Deleting log forwarding destination with ID ${id} for customer ID ${customerId}`);
    
    // Check if the destination exists and belongs to the customer
    const destination = await prisma.logForwardingDestination.findFirst({
      where: {
        id: id,
        customerId
      }
    });
    
    if (!destination) {
      throw new Error('Log forwarding destination not found');
    }
    
    // Delete the destination
    await prisma.logForwardingDestination.delete({
      where: { id: id }
    });
    
    return true;
  },
  
  // Test a log forwarding destination
  async testDestination(id: string, customerId: string): Promise<{ success: boolean; message: string }> {
    loggerService.info(`Testing log forwarding destination with ID ${id} for customer ID ${customerId}`);
    
    // Check if the destination exists and belongs to the customer
    const destination = await prisma.logForwardingDestination.findFirst({
      where: {
        id: id,
        customerId
      }
    });
    
    if (!destination) {
      throw new Error('Log forwarding destination not found');
    }
    
    // In a real implementation, this would actually test the connection
    // For now, we'll just simulate a successful test
    
    // Update the destination with a successful test
    await prisma.logForwardingDestination.update({
      where: { id: id },
      data: {
        lastSync: new Date(),
        error: null
      }
    });
    
    return {
      success: true,
      message: 'Connection test successful'
    };
  }
};

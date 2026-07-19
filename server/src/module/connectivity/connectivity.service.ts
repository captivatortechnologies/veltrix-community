import prisma from '../../db';
import { 
  ConnectivityCreateRequestType, 
  ConnectivityUpdateRequestType,
  ConnectivityResponseType
} from './connectivity.schema';
import { loggerService } from '../../module/logger/logger.service';
import crypto from 'crypto';

export const connectivityService = {
  // Get connectivity for a specific component
  async getConnectivityByComponentId(componentId: string, customerId: string): Promise<ConnectivityResponseType> {
    loggerService.info(`Fetching connectivity for component ID ${componentId} and customer ID ${customerId}`);
    
    // First verify the component belongs to the customer
    const component = await prisma.component.findFirst({
      where: { 
        id: componentId,
        customerId
      }
    });
    
    if (!component) {
      throw new Error('Component not found or access denied');
    }
    
    // Then get the connectivity
    const connectivity = await prisma.componentConnectivity.findUnique({
      where: { componentId: componentId }
    });
    
    if (!connectivity) {
      throw new Error('Connectivity not found for this component');
    }
    
    return connectivity as ConnectivityResponseType;
  },
  
  // Create or update connectivity for a component
  async createOrUpdateConnectivity(data: ConnectivityCreateRequestType, customerId: string): Promise<ConnectivityResponseType> {
    loggerService.info(`Creating/updating connectivity for component ID ${data.componentId} and customer ID ${customerId}`);
    
    // First verify the component belongs to the customer
    const component = await prisma.component.findFirst({
      where: { 
        id: data.componentId,
        customerId
      }
    });
    
    if (!component) {
      throw new Error('Component not found or access denied');
    }
    
    // Generate a TailScale key if not provided
    const tailscaleKey = crypto.randomBytes(16).toString('hex');
    
    // Check if connectivity already exists
    const existingConnectivity = await prisma.componentConnectivity.findUnique({
      where: { componentId: data.componentId }
    });
    
    let connectivity;
    
    if (existingConnectivity) {
      // Update existing connectivity
      connectivity = await prisma.componentConnectivity.update({
        where: { id: existingConnectivity.id },
        data: {
          status: data.status || 'ACTIVE',
          sshCommand: data.sshCommand || `ssh -t tailscale@${component.hostname}`,
          httpsUrl: data.httpsUrl || `https://${component.hostname}:${component.port}`,
          tailscaleKey: existingConnectivity.tailscaleKey // Keep existing key
        }
      });
    } else {
      // Create new connectivity
      connectivity = await prisma.componentConnectivity.create({
        data: {
          componentId: data.componentId,
          status: data.status || 'ACTIVE',
          sshCommand: data.sshCommand || `ssh -t tailscale@${component.hostname}`,
          httpsUrl: data.httpsUrl || `https://${component.hostname}:${component.port}`,
          tailscaleKey
        }
      });
    }
    
    return connectivity as ConnectivityResponseType;
  },
  
  // Update connectivity by component ID
  async updateConnectivity(componentId: string, data: ConnectivityUpdateRequestType, customerId: string): Promise<ConnectivityResponseType> {
    loggerService.info(`Updating connectivity for component ID ${componentId} and customer ID ${customerId}`);
    
    // First verify the component belongs to the customer
    const component = await prisma.component.findFirst({
      where: { 
        id: componentId,
        customerId
      }
    });
    
    if (!component) {
      throw new Error('Component not found or access denied');
    }
    
    // Get existing connectivity
    const existingConnectivity = await prisma.componentConnectivity.findUnique({
      where: { componentId: componentId }
    });
    
    if (!existingConnectivity) {
      throw new Error('Connectivity not found for this component');
    }
    
    // Update connectivity
    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.sshCommand !== undefined) updateData.sshCommand = data.sshCommand;
    if (data.httpsUrl !== undefined) updateData.httpsUrl = data.httpsUrl;
    if (data.tailscaleKey !== undefined) updateData.tailscaleKey = data.tailscaleKey;
    if (data.tailscaleDeviceId !== undefined) updateData.tailscaleDeviceId = data.tailscaleDeviceId;
    if (data.tailscaleDeviceIP !== undefined) updateData.tailscaleDeviceIP = data.tailscaleDeviceIP;
    
    const updatedConnectivity = await prisma.componentConnectivity.update({
      where: { id: existingConnectivity.id },
      data: updateData
    });
    
    return updatedConnectivity as ConnectivityResponseType;
  },
  
  // Delete connectivity by component ID
  async deleteConnectivity(componentId: string, customerId: string): Promise<boolean> {
    loggerService.info(`Deleting connectivity for component ID ${componentId} and customer ID ${customerId}`);
    
    // First verify the component belongs to the customer
    const component = await prisma.component.findFirst({
      where: { 
        id: componentId,
        customerId
      }
    });
    
    if (!component) {
      throw new Error('Component not found or access denied');
    }
    
    // Get existing connectivity
    const existingConnectivity = await prisma.componentConnectivity.findUnique({
      where: { componentId: componentId }
    });
    
    if (!existingConnectivity) {
      throw new Error('Connectivity not found for this component');
    }
    
    // Delete connectivity
    await prisma.componentConnectivity.delete({
      where: { id: existingConnectivity.id }
    });
    
    return true;
  },
  
  // Regenerate TailScale key
  async regenerateTailscaleKey(componentId: string, customerId: string): Promise<ConnectivityResponseType> {
    loggerService.info(`Regenerating TailScale key for component ID ${componentId} and customer ID ${customerId}`);
    
    // First verify the component belongs to the customer
    const component = await prisma.component.findFirst({
      where: { 
        id: componentId,
        customerId
      }
    });
    
    if (!component) {
      throw new Error('Component not found or access denied');
    }
    
    // Get existing connectivity
    const existingConnectivity = await prisma.componentConnectivity.findUnique({
      where: { componentId: componentId }
    });
    
    if (!existingConnectivity) {
      throw new Error('Connectivity not found for this component');
    }
    
    // Generate new TailScale key
    const newTailscaleKey = crypto.randomBytes(16).toString('hex');
    
    // Update connectivity with new key
    const updatedConnectivity = await prisma.componentConnectivity.update({
      where: { id: existingConnectivity.id },
      data: {
        tailscaleKey: newTailscaleKey,
        status: 'ACTIVE' // Reset status to active
      }
    });
    
    return updatedConnectivity as ConnectivityResponseType;
  }
};

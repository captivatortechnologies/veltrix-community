import prisma from '../../db';
import axios from 'axios';
import { 
  TailscaleKeyRequestType, 
  TailscaleConfigRequestType,
  TailscaleConfigResponseType,
  TailscaleDeviceType,
  TailscaleConnectivityType
} from './tailscale.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tailscaleService = {
  // Check if Tailscale is configured
  async checkConfig(): Promise<{ configured: boolean; apiUrl?: string }> {
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config || !config.apiKey || !config.tailnet) {
      return { configured: false };
    }
    
    return {
      configured: true,
      apiUrl: config.apiUrl
    };
  },
  
  // Get Tailscale configuration
  async getConfig(): Promise<TailscaleConfigResponseType | null> {
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config) {
      return null;
    }
    
    // Don't return the API key in the response
    const { apiKey, ...safeConfig } = config;
    
    return {
      ...safeConfig,
      apiKeyConfigured: true
    };
  },
  
  // Create or update Tailscale configuration
  async upsertConfig(data: TailscaleConfigRequestType): Promise<TailscaleConfigResponseType> {
    // Get the first config (if it exists)
    const existingConfig = await prisma.tailscaleConfig.findFirst();
    
    let config;
    
    if (existingConfig) {
      // Update existing config
      config = await prisma.tailscaleConfig.update({
        where: { id: existingConfig.id },
        data: {
          apiUrl: data.apiUrl || 'https://api.tailscale.com/api/v2',
          tailnet: data.tailnet,
          apiKey: data.apiKey,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new config
      config = await prisma.tailscaleConfig.create({
        data: {
          apiUrl: data.apiUrl || 'https://api.tailscale.com/api/v2',
          tailnet: data.tailnet,
          apiKey: data.apiKey
        }
      });
    }
    
    // Don't return the API key in the response
    const { apiKey, ...safeConfig } = config;
    
    return {
      ...safeConfig,
      apiKeyConfigured: true
    };
  },
  
  // Delete Tailscale configuration
  async deleteConfig(): Promise<boolean> {
    // Get the first config (if it exists)
    const existingConfig = await prisma.tailscaleConfig.findFirst();
    
    if (existingConfig) {
      await prisma.tailscaleConfig.delete({
        where: { id: existingConfig.id }
      });
      return true;
    }
    
    return false;
  },
  
  // Get all Tailscale devices
  async getAllDevices(): Promise<TailscaleDeviceType[]> {
    const config = await prisma.tailscaleConfig.findFirst();

    if (!config || !config.apiKey || !config.tailnet) {
      loggerService.warn('Tailscale API not configured - returning empty device list');
      return []; // Return empty array instead of throwing error
    }

    loggerService.info('Fetching Tailscale devices', {
      apiUrl: config.apiUrl,
      tailnet: config.tailnet
    });
    
    const response = await axios.get(`${config.apiUrl}/tailnet/${config.tailnet}/devices`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      },
      params: {
        fields: 'all'
      }
    });
    
    // If there are no devices, return an empty array
    if (!response.data.devices || !Array.isArray(response.data.devices)) {
      loggerService.warn('No devices found in Tailscale API response or invalid format');
      return [];
    }
    
    // Log each device's hostname for debugging
    response.data.devices.forEach((device: TailscaleDeviceType) => {
      loggerService.debug(`Tailscale device: ${device.hostname}, ID: ${device.id}, Addresses: ${JSON.stringify(device.addresses)}`);
    });
    
    return response.data.devices;
  },
  
  // Get a Tailscale device by ID
  async getDeviceById(id: string): Promise<TailscaleDeviceType> {
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config || !config.apiKey || !config.tailnet) {
      throw new Error('Tailscale API not configured');
    }
    
    loggerService.info(`Fetching Tailscale device with ID: ${id}`);
    
    const response = await axios.get(`${config.apiUrl}/device/${id}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    return response.data;
  },
  
  // Delete a Tailscale device
  async deleteDevice(id: string): Promise<boolean> {
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config || !config.apiKey || !config.tailnet) {
      throw new Error('Tailscale API not configured');
    }
    
    await axios.delete(`${config.apiUrl}/device/${id}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });
    
    return true;
  },
  
  // Generate a Tailscale key
  async generateKey(data: TailscaleKeyRequestType): Promise<TailscaleConnectivityType> {
    // Get the Tailscale configuration
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config || !config.apiKey || !config.tailnet) {
      throw new Error('Tailscale API not configured');
    }
    
    // Get the component details
    const component = await prisma.component.findUnique({
      where: { id: data.componentId }
    });
    
    if (!component) {
      throw new Error('Component not found');
    }
    
    // Get organization details
    const customer = await prisma.organization.findUnique({
      where: { id: data.customerId }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Create a very simple description with no spaces (Tailscale may have strict requirements)
    // Tailscale docs recommend simple alphanumeric descriptions
    let keyDescription = "Component" + data.componentId.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '');
    
    // Create the absolute minimum required payload
    const payload = {
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: false
          }
        }
      },
      expirySeconds: 86400, // 24 hours
      description: keyDescription
    };
    
    loggerService.info(`Sending Tailscale API request with minimal payload: ${JSON.stringify(payload)}`);
    
    try {
      const keyResponse = await axios.post(
        `${config.apiUrl}/tailnet/${config.tailnet}/keys`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const key = keyResponse.data.key;
      
      // Create or update connectivity record
      const connectivity = await prisma.componentConnectivity.upsert({
        where: {
          componentId: data.componentId
        },
        update: {
          status: 'INACTIVE',
          tailscaleKey: key,
          // tailscaleDeviceId will be updated when device connects
          sshCommand: `ssh ${component.hostname}`,
          httpsUrl: `https://${component.hostname}:${component.port}`,
          updatedAt: new Date()
        },
        create: {
          componentId: data.componentId,
          status: 'INACTIVE',
          tailscaleKey: key,
          // tailscaleDeviceId will be updated when device connects
          sshCommand: `ssh ${component.hostname}`,
          httpsUrl: `https://${component.hostname}:${component.port}`,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      
      // Generate Linux installation commands
      const installCommands = `curl -fsSL https://tailscale.com/install.sh | sh
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
tailscale up --ssh --accept-routes --authkey=${key}`;
      
      return {
        ...connectivity,
        installCommands
      };
    } catch (error) {
      // Log detailed error information
      loggerService.error('Tailscale API error details:', { 
        error: error.response?.data || error.message,
        status: error.response?.status,
        config: error.config ? { 
          url: error.config.url,
          method: error.config.method,
          data: error.config.data
        } : 'No config available'
      });
      
      // Rethrow the error for the controller to handle
      throw error;
    }
    
  }
};

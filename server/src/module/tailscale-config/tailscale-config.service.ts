import prisma from '../../db';
import { 
  TailscaleConfigRequestType,
  TailscaleConfigResponseType,
  TailscaleConfigCheckResponseType,
  SuccessMessageType
} from './tailscale-config.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tailscaleConfigService = {
  // Get global Tailscale configuration
  async getConfig(): Promise<TailscaleConfigResponseType> {
    loggerService.info('Fetching Tailscale configuration');
    
    // Get the first config (there should only be one)
    const config = await prisma.tailscaleConfig.findFirst();
    
    if (!config) {
      throw new Error('Tailscale configuration not found');
    }
    
    // Don't return the API key in the response
    const { apiKey, ...safeConfig } = config;
    
    return {
      ...safeConfig,
      apiKeyConfigured: true
    } as TailscaleConfigResponseType;
  },
  
  // Create or update Tailscale configuration
  async upsertConfig(data: TailscaleConfigRequestType): Promise<TailscaleConfigResponseType> {
    loggerService.info('Creating or updating Tailscale configuration');
    
    const { apiUrl, tailnet, apiKey } = data;
    
    if (!tailnet || !apiKey) {
      throw new Error('Tailnet and API key are required');
    }
    
    // Get the first config (if it exists)
    const existingConfig = await prisma.tailscaleConfig.findFirst();
    
    let config;
    
    if (existingConfig) {
      // Update existing config
      config = await prisma.tailscaleConfig.update({
        where: { id: existingConfig.id },
        data: {
          apiUrl: apiUrl || 'https://api.tailscale.com/api/v2',
          tailnet,
          apiKey,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new config
      config = await prisma.tailscaleConfig.create({
        data: {
          apiUrl: apiUrl || 'https://api.tailscale.com/api/v2',
          tailnet,
          apiKey
        }
      });
    }
    
    // Don't return the API key in the response
    const { apiKey: _, ...safeConfig } = config;
    
    return {
      ...safeConfig,
      apiKeyConfigured: true
    } as TailscaleConfigResponseType;
  },
  
  // Delete Tailscale configuration
  async deleteConfig(): Promise<SuccessMessageType> {
    loggerService.info('Deleting Tailscale configuration');
    
    // Get the first config (if it exists)
    const existingConfig = await prisma.tailscaleConfig.findFirst();
    
    if (existingConfig) {
      await prisma.tailscaleConfig.delete({
        where: { id: existingConfig.id }
      });
    }
    
    return { message: 'Tailscale configuration deleted successfully' };
  },
  
  // Check if Tailscale is configured
  async checkConfig(): Promise<TailscaleConfigCheckResponseType> {
    loggerService.info('Checking Tailscale configuration');
    
    const config = await prisma.tailscaleConfig.findFirst();
    
    return {
      configured: !!config,
      apiUrl: config?.apiUrl || null,
      tailnet: config?.tailnet || null
    };
  }
};

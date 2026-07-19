import { ConnectivityAdapter } from './types';

/**
 * Adapter for ZeroTier Software-Defined Networking.
 * testConnection calls the ZeroTier Central API to verify credentials and
 * confirm the network exists.
 */
export class ZerotierAdapter implements ConnectivityAdapter {
  private readonly centralApiBase = 'https://api.zerotier.com/api/v1';

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.networkId || typeof config.networkId !== 'string') {
      errors.push('networkId is required and must be a string');
    }

    if (!config.apiToken || typeof config.apiToken !== 'string') {
      errors.push('apiToken is required and must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const validation = this.validateConfig(config);

    if (!validation.valid) {
      return {
        success: false,
        message: `Configuration invalid: ${validation.errors.join('; ')}`
      };
    }

    const networkId = config.networkId as string;
    const apiToken = config.apiToken as string;

    const start = Date.now();

    try {
      const response = await fetch(`${this.centralApiBase}/network/${networkId}`, {
        method: 'GET',
        headers: {
          Authorization: `token ${apiToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10_000)
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          success: true,
          message: `Successfully connected to ZeroTier Central for network ${networkId}`,
          latencyMs
        };
      }

      const body = await response.text().catch(() => '');
      return {
        success: false,
        message: `ZeroTier Central API returned ${response.status}: ${body || response.statusText}`,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to reach ZeroTier Central API: ${message}`,
        latencyMs
      };
    }
  }

  getSensitiveFields(): string[] {
    return ['apiToken'];
  }
}

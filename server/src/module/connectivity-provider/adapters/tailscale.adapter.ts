import { ConnectivityAdapter } from './types';

/**
 * Adapter for Tailscale VPN connectivity.
 * Authenticates via the Tailscale API using an API key and tailnet name.
 * testConnection hits the Tailscale API to list devices, confirming auth is valid.
 */
export class TailscaleAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.tailnet || typeof config.tailnet !== 'string') {
      errors.push('tailnet is required and must be a string');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      errors.push('apiKey is required and must be a string');
    }

    // apiUrl is optional — we default it if missing
    if (config.apiUrl !== undefined && typeof config.apiUrl !== 'string') {
      errors.push('apiUrl must be a string when provided');
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const apiUrl = (config.apiUrl as string) || 'https://api.tailscale.com/api/v2';
    const tailnet = config.tailnet as string;
    const apiKey = config.apiKey as string;

    const start = Date.now();

    try {
      const response = await fetch(`${apiUrl}/tailnet/${tailnet}/devices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10_000)
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          success: true,
          message: 'Successfully connected to Tailscale API',
          latencyMs
        };
      }

      const body = await response.text().catch(() => '');
      return {
        success: false,
        message: `Tailscale API returned ${response.status}: ${body || response.statusText}`,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message: `Failed to reach Tailscale API: ${message}`, latencyMs };
    }
  }

  getSensitiveFields(): string[] {
    return ['apiKey'];
  }
}

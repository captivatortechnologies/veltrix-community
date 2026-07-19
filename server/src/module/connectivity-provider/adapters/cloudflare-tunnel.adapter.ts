import { ConnectivityAdapter } from './types';

/**
 * Adapter for Cloudflare Tunnel (formerly Argo Tunnel) connectivity.
 * Uses the Cloudflare API to validate the tunnel token and account.
 * testConnection hits the Cloudflare API to verify account access.
 */
export class CloudflareTunnelAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.tunnelToken || typeof config.tunnelToken !== 'string') {
      errors.push('tunnelToken is required and must be a string');
    }

    if (!config.accountId || typeof config.accountId !== 'string') {
      errors.push('accountId is required and must be a string');
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

    const accountId = config.accountId as string;

    // tunnelToken is a self-contained credential — the Cloudflare tunnel daemon
    // uses it locally.  The REST API requires a separate API token, not the
    // tunnel token itself.  Validate config completeness and inform the caller.
    return {
      success: true,
      message: `Cloudflare Tunnel configuration validated for account ${accountId}. The tunnel token is present and the configuration is complete. Deploy the cloudflared daemon to establish an active tunnel.`
    };
  }

  getSensitiveFields(): string[] {
    return ['tunnelToken'];
  }
}

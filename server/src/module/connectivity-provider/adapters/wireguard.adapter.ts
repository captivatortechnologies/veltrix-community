import { ConnectivityAdapter } from './types';

/**
 * Adapter for WireGuard VPN connectivity.
 * WireGuard operates at the kernel/network level — actual connectivity
 * testing requires privileged network access, so testConnection validates
 * config completeness only.
 */
export class WireguardAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.privateKey || typeof config.privateKey !== 'string') {
      errors.push('privateKey is required and must be a string');
    }

    if (!config.publicKey || typeof config.publicKey !== 'string') {
      errors.push('publicKey (peer public key) is required and must be a string');
    }

    if (!config.endpoint || typeof config.endpoint !== 'string') {
      errors.push('endpoint (host:port) is required and must be a string');
    }

    if (!config.allowedIPs || typeof config.allowedIPs !== 'string') {
      errors.push('allowedIPs is required and must be a string (e.g. "0.0.0.0/0" or "10.0.0.0/8")');
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

    const endpoint = config.endpoint as string;

    return {
      success: true,
      message: `WireGuard configuration validated for endpoint ${endpoint}. Live connectivity test requires kernel-level network access to the peer endpoint.`
    };
  }

  getSensitiveFields(): string[] {
    return ['privateKey', 'presharedKey'];
  }
}

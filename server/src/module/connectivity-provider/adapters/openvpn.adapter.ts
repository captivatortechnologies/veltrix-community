import { ConnectivityAdapter } from './types';

type OpenVpnProtocol = 'tcp' | 'udp';

/**
 * Adapter for OpenVPN connectivity.
 * OpenVPN operates at the network/TLS layer — actual tunnel establishment
 * requires the OpenVPN client binary and privileged network access.
 * testConnection validates that the required certificate material and
 * server configuration fields are present.
 */
export class OpenvpnAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.serverAddress || typeof config.serverAddress !== 'string') {
      errors.push('serverAddress is required and must be a string');
    }

    if (config.port !== undefined) {
      const port = Number(config.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('port must be an integer between 1 and 65535');
      }
    }

    if (config.protocol !== undefined) {
      const validProtocols: OpenVpnProtocol[] = ['tcp', 'udp'];
      if (!validProtocols.includes(config.protocol as OpenVpnProtocol)) {
        errors.push('protocol must be either "tcp" or "udp"');
      }
    }

    if (!config.caCert || typeof config.caCert !== 'string') {
      errors.push('caCert (CA certificate PEM) is required and must be a string');
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

    const serverAddress = config.serverAddress as string;
    const port = config.port !== undefined ? Number(config.port) : 1194;
    const protocol = (config.protocol as string) || 'udp';

    return {
      success: true,
      message: `OpenVPN configuration validated for ${serverAddress}:${port} (${protocol.toUpperCase()}). CA certificate is present. Use the OpenVPN client to establish a live connection to the server.`
    };
  }

  getSensitiveFields(): string[] {
    return ['clientKey', 'tlsAuthKey'];
  }
}

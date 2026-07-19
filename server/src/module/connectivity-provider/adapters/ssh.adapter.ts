import { ConnectivityAdapter } from './types';

/**
 * Adapter for SSH-based remote access.
 * Validates that the required connection fields are present.
 * Actual SSH connectivity testing requires network access to customer
 * infrastructure, so testConnection validates config completeness only.
 */
export class SshAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.host || typeof config.host !== 'string') {
      errors.push('host is required and must be a string');
    }

    if (config.port !== undefined) {
      const port = Number(config.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('port must be an integer between 1 and 65535');
      }
    }

    if (!config.username || typeof config.username !== 'string') {
      errors.push('username is required and must be a string');
    }

    const hasPrivateKey = typeof config.privateKey === 'string' && config.privateKey.length > 0;
    const hasPassword = typeof config.password === 'string' && config.password.length > 0;

    if (!hasPrivateKey && !hasPassword) {
      errors.push('either privateKey or password must be provided for authentication');
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

    const host = config.host as string;
    const port = config.port !== undefined ? Number(config.port) : 22;
    const authMethod = config.privateKey ? 'private key' : 'password';

    return {
      success: true,
      message: `SSH configuration validated for ${host}:${port} using ${authMethod} authentication. Live connectivity test requires network access to target host.`
    };
  }

  getSensitiveFields(): string[] {
    return ['privateKey', 'password', 'passphrase'];
  }
}

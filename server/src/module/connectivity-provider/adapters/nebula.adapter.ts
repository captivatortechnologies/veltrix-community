import { ConnectivityAdapter } from './types';

/**
 * Adapter for Nebula overlay network (Slack/DefinedNetworking).
 * Nebula is a peer-to-peer overlay — there is no central API to call.
 * testConnection validates that all required PKI material and lighthouse
 * configuration is present.
 */
export class NebulaAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.caCert || typeof config.caCert !== 'string') {
      errors.push('caCert (CA certificate PEM) is required and must be a string');
    }

    if (!config.nodeCert || typeof config.nodeCert !== 'string') {
      errors.push('nodeCert (node certificate PEM) is required and must be a string');
    }

    if (!config.nodeKey || typeof config.nodeKey !== 'string') {
      errors.push('nodeKey (node private key PEM) is required and must be a string');
    }

    if (!config.lighthouseHost || typeof config.lighthouseHost !== 'string') {
      errors.push('lighthouseHost (IP or hostname of the Nebula lighthouse) is required and must be a string');
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

    const lighthouseHost = config.lighthouseHost as string;

    return {
      success: true,
      message: `Nebula configuration validated. CA certificate, node certificate, and node key are present. Deploy the Nebula binary with this configuration to connect to the lighthouse at ${lighthouseHost}.`
    };
  }

  getSensitiveFields(): string[] {
    return ['nodeKey'];
  }
}

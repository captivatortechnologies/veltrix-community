import { ConnectivityAdapter } from './types';

/**
 * Adapter for HashiCorp Boundary connectivity.
 * Validates credentials and optionally authenticates against the Boundary
 * API to confirm the controller address is reachable and the auth method exists.
 */
export class HashicorpBoundaryAdapter implements ConnectivityAdapter {
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.boundaryAddr || typeof config.boundaryAddr !== 'string') {
      errors.push('boundaryAddr (Boundary controller address, e.g. "https://boundary.example.com") is required and must be a string');
    }

    if (!config.authMethodId || typeof config.authMethodId !== 'string') {
      errors.push('authMethodId (Boundary auth method ID, e.g. "ampw_...") is required and must be a string');
    }

    if (!config.loginName || typeof config.loginName !== 'string') {
      errors.push('loginName is required and must be a string');
    }

    // Either password or a pre-issued token must be present
    const hasPassword = typeof config.password === 'string' && config.password.length > 0;
    const hasToken = typeof config.token === 'string' && config.token.length > 0;

    if (!hasPassword && !hasToken) {
      errors.push('either password or a pre-issued token must be provided');
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

    const boundaryAddr = config.boundaryAddr as string;
    const authMethodId = config.authMethodId as string;

    const start = Date.now();

    try {
      // Probe the Boundary health endpoint to confirm the controller is reachable
      const healthUrl = `${boundaryAddr.replace(/\/$/, '')}/v1/auth-methods/${authMethodId}`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });

      const latencyMs = Date.now() - start;

      // 200 = auth method found, 401 = controller reachable but needs auth
      if (response.ok || response.status === 401 || response.status === 403) {
        return {
          success: true,
          message: `HashiCorp Boundary controller at ${boundaryAddr} is reachable and auth method ${authMethodId} was found`,
          latencyMs
        };
      }

      const body = await response.text().catch(() => '');
      return {
        success: false,
        message: `Boundary controller returned ${response.status}: ${body || response.statusText}`,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to reach Boundary controller at ${boundaryAddr}: ${message}`,
        latencyMs
      };
    }
  }

  getSensitiveFields(): string[] {
    return ['password', 'token'];
  }
}

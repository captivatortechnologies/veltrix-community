// Adapter interface that every connectivity provider adapter must implement

export interface ConnectivityAdapter {
  /**
   * Validate the provider-specific configuration object.
   * Returns a list of human-readable error messages when invalid.
   */
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] };

  /**
   * Attempt to reach the remote system using the supplied config.
   * For providers that expose an HTTP control-plane (Tailscale, ZeroTier) an
   * actual HTTP request is made.  For protocol-level providers (SSH, WireGuard,
   * OpenVPN, Nebula) the config is validated for completeness and a
   * "Configuration validated" message is returned — real connectivity testing
   * would require network access to customer infrastructure.
   */
  testConnection(
    config: Record<string, unknown>
  ): Promise<{ success: boolean; message: string; latencyMs?: number }>;

  /**
   * Return the list of config field names that contain sensitive values
   * (API keys, private keys, passwords, tokens).
   * The service layer uses this list to mask values before returning them to
   * the client — replacing them with '••••••' + last-4-chars.
   */
  getSensitiveFields(): string[];
}

import { HttpClient, DEFAULT_BASE_URL } from './http-client';
import * as Resources from './resources'; // Import all resource classes

// Define the configuration interface for the client
export interface VeltrixClientConfig {
  /** API key for authentication. Sent as `Authorization: ApiKey <key>`. */
  apiKey?: string;
  /** JWT bearer token for authentication. Sent as `Authorization: Bearer <jwt>`. */
  jwtToken?: string;
  /** Optional tenant/organization id, sent as the `X-Customer-ID` header. */
  customerId?: string;
  /**
   * Base URL of the Veltrix API.
   * Resolution order when omitted: `VELTRIX_API_URL` env var (Node only),
   * then the default `http://localhost:5000/api`.
   */
  baseURL?: string;
  /** Request timeout in milliseconds (default: 60000). */
  timeout?: number;
}

/**
 * Resolves the API base URL from the explicit config, the `VELTRIX_API_URL`
 * environment variable (when running under Node), or the localhost default.
 * No hosted/commercial URL is ever baked in.
 */
function resolveBaseUrl(baseURL?: string): string {
  if (baseURL) return baseURL;
  if (typeof process !== 'undefined' && process.env && process.env.VELTRIX_API_URL) {
    return process.env.VELTRIX_API_URL;
  }
  return DEFAULT_BASE_URL;
}

export class VeltrixClient {
  private readonly httpClient: HttpClient;

  // Resource handlers exposed to consumers of the SDK.
  public readonly auth: Resources.AuthResource;
  public readonly profile: Resources.ProfileResource;
  public readonly organization: Resources.OrganizationResource;
  public readonly users: Resources.UsersResource;
  public readonly roles: Resources.RolesResource;
  public readonly apiKeys: Resources.ApiKeysResource;
  public readonly tools: Resources.ToolsResource;
  public readonly components: Resources.ComponentsResource;
  public readonly credentials: Resources.CredentialsResource;
  public readonly tags: Resources.TagsResource;
  public readonly connectivity: Resources.ConnectivityResource;
  public readonly tailscale: Resources.TailscaleResource;
  public readonly tailscaleConfig: Resources.TailscaleConfigResource;
  public readonly logForwarding: Resources.LogForwardingResource;
  public readonly logEntries: Resources.LogEntriesResource;
  public readonly webhooks: Resources.WebhooksResource;
  public readonly cognito: Resources.CognitoResource;

  constructor(config: VeltrixClientConfig = {}) {
    const { apiKey, jwtToken, customerId, timeout = 60000 } = config;
    const baseURL = resolveBaseUrl(config.baseURL);

    this.httpClient = new HttpClient({
      apiKey,
      jwtToken,
      customerId,
      baseURL,
      timeout,
    });

    // Initialize resource handlers
    this.auth = new Resources.AuthResource(this.httpClient);
    this.profile = new Resources.ProfileResource(this.httpClient);
    this.organization = new Resources.OrganizationResource(this.httpClient);
    this.users = new Resources.UsersResource(this.httpClient);
    this.roles = new Resources.RolesResource(this.httpClient);
    this.apiKeys = new Resources.ApiKeysResource(this.httpClient);
    this.tools = new Resources.ToolsResource(this.httpClient);
    this.components = new Resources.ComponentsResource(this.httpClient);
    this.credentials = new Resources.CredentialsResource(this.httpClient);
    this.tags = new Resources.TagsResource(this.httpClient);
    this.connectivity = new Resources.ConnectivityResource(this.httpClient);
    this.tailscale = new Resources.TailscaleResource(this.httpClient);
    this.tailscaleConfig = new Resources.TailscaleConfigResource(this.httpClient);
    this.logForwarding = new Resources.LogForwardingResource(this.httpClient);
    this.logEntries = new Resources.LogEntriesResource(this.httpClient);
    this.webhooks = new Resources.WebhooksResource(this.httpClient);
    this.cognito = new Resources.CognitoResource(this.httpClient);
  }

  /**
   * Returns the resolved base URL the client is configured to use.
   */
  public getBaseUrl(): string {
    return this.httpClient.getBaseUrl();
  }

  /**
   * Sets or updates the customer/organization ID for subsequent requests.
   * @param customerId The customer ID string.
   */
  public setCustomerId(customerId: string | undefined): void {
    this.httpClient.setCustomerId(customerId);
  }
}

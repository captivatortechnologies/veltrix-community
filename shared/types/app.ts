// ========================================================================
// App Manifest & Marketplace Types
// Shared between server, client, and app-sdk
// ========================================================================

export type AppSource = 'BUILT_IN' | 'MARKETPLACE' | 'CUSTOM'
export type AppStatusType = 'AVAILABLE' | 'DEPRECATED' | 'REMOVED'
export type AppInstallationStatus =
  | 'INSTALLING'
  | 'INSTALLED'
  | 'ENABLED'
  | 'DISABLED'
  | 'FAILED'
  | 'UNINSTALLING'

// --- Manifest Types (parsed from manifest.yaml) ---

export interface AppManifest {
  id: string
  name: string
  version: string
  vendor: string
  description: string
  category: string
  license?: string
  homepage?: string
  icon?: string
  logo?: string

  platform: {
    minVersion: string
  }

  permissions: {
    platform: string[] // Platform permissions the app needs
    app: AppPermissionDeclaration[] // Permissions the app exposes
  }

  database?: {
    migrations: string
    tablePrefix: string
    /**
     * How the app's tables are namespaced:
     *   'shared'   — prefixed tables in `public` (trusted first-party apps)
     *   'schema'   — a dedicated Postgres schema + least-privilege role
     *   'database' — a dedicated Postgres database (hard blast-radius isolation)
     *   'external' — the app owns its datastore; the platform manages no schema
     * The platform forces at least 'schema' for marketplace / self-managed
     * apps, which may opt up to 'database' or 'external'.
     */
    isolation?: 'shared' | 'schema' | 'database' | 'external'
  }

  pipeline: {
    configurationTypes: AppConfigurationTypeManifest[]
    pipelineEvents?: string[]
  }

  server: {
    entry: string
    routes?: {
      prefix: string
    }
  }

  client?: {
    entry: string
    pages?: AppPageDeclaration[]
    /** How the app's navigation is laid out: 'tabs' (default) or 'sidebar'. */
    navLayout?: 'tabs' | 'sidebar'
  }

  /**
   * Vendor brand identity, applied by the platform in defined slots only —
   * the app navbar (logo, accent) and scoped CSS variables. The platform,
   * not the app, decides where brand color appears, so one vendor's palette
   * never overwhelms the product shell.
   */
  branding?: AppBrandingDeclaration

  hooks?: {
    onInstall?: string
    onUninstall?: string
    onEnable?: string
    onDisable?: string
    onUpgrade?: string
    onWebhook?: string
    onEvent?: string
  }

  /** Connection-level connectivity test handler (extensionless path). */
  connectivity?: {
    testHandler?: string
  }

  /**
   * Connection lifecycle declarations. `onboarding` opts the app into the
   * platform's one-click connection onboarding — the app *declares* what it
   * needs (a named onboarding adapter + parameters) and the platform *drives*
   * it. Nothing here is provider-specific to the platform core; Microsoft Entra
   * admin-consent is simply the first adapter (`provider: 'entra-admin-consent'`).
   */
  connection?: AppConnectionDeclaration

  /**
   * App-level operations — one-off actions (not config deploys), invoked from an
   * app page and run in-process with the decrypted credential. See
   * POST /api/apps/:appId/operations/:operationId.
   */
  operations?: AppOperation[]

  events?: string[] // Platform events this app subscribes to

  settings?: AppSettingDeclaration[]
}

/** App-declared connection lifecycle capabilities. */
export interface AppConnectionDeclaration {
  onboarding?: ConnectionOnboardingDescriptor
}

/**
 * Declarative "one-click connect" descriptor. The platform reads it to render a
 * "Connect …" button and to drive a named onboarding adapter; the app supplies
 * only data, never platform code.
 */
export interface ConnectionOnboardingDescriptor {
  /** Names a platform onboarding adapter (e.g. `entra-admin-consent`). */
  provider: string
  /** Button label in the Connections UI (e.g. "Connect Microsoft Defender"). */
  label: string
  params?: ConnectionOnboardingParams
  /**
   * Optional app-provided finalize hook (extensionless path). Run in-process
   * after a successful onboarding, exactly like `connectivity.testHandler`.
   */
  onboardingHandler?: string
}

export interface ConnectionOnboardingParams {
  /** App-setting key whose value selects the sovereign cloud (e.g. `azure_cloud`). */
  cloudSetting?: string
  /**
   * App permissions this connection needs — for display + audience selection.
   * The effective grant is fixed on the connector app registration, not here.
   */
  requiredResourceAccess?: OnboardingRequiredResource[]
  /** What the flow captures and where it maps back onto the connection. */
  capture?: OnboardingCapture
  /** True → the connection uses the platform token broker and stores NO secret. */
  brokered?: boolean
  /**
   * App settings the admin must supply BEFORE the consent click (they cannot be
   * derived from consent), e.g. Sentinel's subscription/resource-group/workspace.
   */
  requiredSettings?: string[]
  /** Post-consent provisioning steps the adapter runs (e.g. Sentinel ARM RBAC). */
  provisioning?: OnboardingProvisioningStep[]
}

export interface OnboardingRequiredResource {
  /** Well-known resource name or appId (e.g. `WindowsDefenderATP`, `Graph`). */
  resource: string
  /** Application permissions requested on that resource (display only). */
  appPermissions: string[]
}

export interface OnboardingCapture {
  /**
   * Where to write the consented tenant id. `setting:<key>` writes it into the
   * named app setting (the app libs read it as their `tenant_id`).
   */
  tenantId?: string
}

/** A post-consent provisioning step. Only ARM role assignment exists today. */
export interface OnboardingProvisioningStep {
  type: 'arm-role-assignment'
  /** Well-known built-in role name (resolved to a role-definition id by the adapter). */
  role: string
  /** ARM scope granularity for the assignment. */
  scope: 'resourceGroup' | 'subscription'
  /**
   * How the ARM token for the assignment is obtained:
   *   - `manual` (default): show a portal deep-link/CLI + a verify probe. No
   *     extra platform privilege — consent does not grant ARM RBAC.
   *   - `delegated`: opt-in second delegated-ARM leg (requires the admin to hold
   *     Owner / User Access Administrator). Not implemented in the first cut.
   */
  armToken?: 'manual' | 'delegated'
}

/**
 * A one-off app operation (restart, export, retry, …). Unlike a configuration
 * type it does not deploy declarative state — it performs an action against the
 * target using the decrypted credential and returns a result.
 */
export interface AppOperation {
  id: string
  name: string
  description?: string
  /** Extensionless path to the handler module (default export). */
  handler: string
  /** Disruptive action (e.g. restart) — the UI confirms before running. */
  destructive?: boolean
  /** Whether the operation needs a credential (default true). */
  requiresCredential?: boolean
}

/**
 * App brand identity (mirrors @veltrix/app-sdk). The platform renders
 * it in a per-app navbar above the app's pages and exposes the colors to app
 * pages as scoped CSS variables (--veltrix-app-primary, --veltrix-app-accent).
 */
export interface AppBrandingDeclaration {
  /** Brand accent color as #RGB or #RRGGBB hex. */
  primaryColor?: string
  /** Optional secondary color as #RGB or #RRGGBB hex. */
  accentColor?: string
  /**
   * Vendor logo shown in the app navbar and on the marketplace card. Either a
   * repo-relative .svg (preferred) or .png at most 128 KB, OR an absolute
   * https:// URL to an externally hosted asset. Rendered at ~28px height.
   */
  logo?: string
  /** Optional logo variant for dark backgrounds; same constraints as logo. */
  logoDark?: string
}

export interface AppConfigurationTypeManifest {
  id: string
  name: string
  description?: string
  /**
   * Optional sub-section label used to cluster this configuration type under a
   * collapsible group in the app sidebar's "Configurations" section (e.g.
   * "Access Policies"). Purely presentational; the platform renders whatever
   * groups an app declares and leaves ungrouped types in a flat list. Apps with
   * long configuration lists use this to stay navigable.
   */
  group?: string
  canvasTemplate: string // Path to canvas template YAML
  defaultConfig?: string // Path to default config YAML

  handlers: {
    validate: string
    deploy: string
    rollback: string
    healthCheck: string
    driftDetect?: string | null
    getStatus: string
    /** Optional live-options provider (powers remote-multiselect fields). */
    options?: string | null
  }

  targets: {
    componentTypes: string[]
    requiresCredential: boolean
    requiresConnectivity: boolean
  }
}

export interface AppPermissionDeclaration {
  resource: string
  actions: string[]
  description?: string
}

// --- App UI & navigation contract (mirrors @veltrix/app-sdk) ---
// The platform owns the chrome (breadcrumb, app header, navigation, permission
// gating, error boundary, loading states); apps own the page body.

export type AppPageLayout = 'standard' | 'full-bleed' | 'canvas'
export type AppPageNav = 'sidebar' | 'tab' | 'hidden'

export interface AppPagePermission {
  resource: string
  action: string
}

export interface AppPageDeclaration {
  path: string
  component: string
  label: string
  description?: string
  icon?: string
  /** @deprecated use `nav` */
  sidebar?: boolean
  nav?: AppPageNav
  parent?: string
  group?: string
  order?: number
  layout?: AppPageLayout
  requiresPermission?: AppPagePermission
}

export interface AppSettingDeclaration {
  key: string
  type: 'string' | 'number' | 'boolean' | 'select'
  label: string
  description?: string
  default?: string | number | boolean
  required?: boolean
  options?: Array<{ label: string; value: string }>
}

// --- API Response Types ---

export interface AppListItem {
  id: string
  appId: string
  name: string
  version: string
  vendor: string
  description: string
  category: string
  icon?: string
  logo?: string
  source: AppSource
  isDefault: boolean
  status: AppStatusType
  installed?: boolean
  enabled?: boolean
  /** Runtime brand slots (colors + served logo URLs). Present only when the
   *  app's manifest declares usable branding whose logo file exists. */
  branding?: {
    primaryColor?: string
    accentColor?: string
    logoUrl?: string
    logoDarkUrl?: string
  }
}

export interface AppDetail extends AppListItem {
  license?: string
  homepage?: string
  repository?: string
  configurationTypes: Array<{
    id: string
    name: string
    description?: string
    componentTypes: string[]
  }>
  permissions: AppPermissionDeclaration[]
  settings: AppSettingDeclaration[]
}

export interface AppInstallationDetail {
  id: string
  appId: string
  customerId: string
  version: string
  enabled: boolean
  installedBy: string
  installedAt: string
  settings: Record<string, unknown>
  status: AppInstallationStatus
  app: AppListItem
}

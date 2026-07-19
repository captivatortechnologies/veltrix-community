// ========================================================================
// Pipeline Engine Internal Types
// These types define the contracts between the pipeline engine and apps
// ========================================================================

import type {
  ValidationResult,
  DeployResult,
  HealthCheckResult,
  RollbackResult,
  DriftResult,
  DriftDiff,
  ConfigStatus,
  ComponentConfigStatus,
  DeploymentStrategy,
} from '../../../../shared/types/pipeline'
import type { PermissionSnapshot } from '../../lib/permissions'

// --- Pipeline Context (passed to all app handlers) ---

/**
 * Optional pluggable identity extension point. When present, it is handed to
 * handlers as `ctx.identity` and lets an app mint an app-only access token for
 * a customer tenant WITHOUT holding any secret of its own — an operator-
 * supplied broker implementation performs the token exchange (e.g. against a
 * centrally-registered connector app for that cloud) and caches the result.
 * Present only for connections onboarded through a consent/broker flow that an
 * operator has wired up; the default BYO-secret connection path keeps
 * self-minting tokens and never needs this. The community edition ships no
 * broker implementation — this interface exists purely so `DeployContext` /
 * `RollbackContext` / etc. have a stable, optional extension seam.
 */
export interface IdentityBroker {
  getAccessToken(opts: {
    /** Consented customer Entra tenant id. */
    tenantId: string
    /** Token audience, e.g. `https://graph.microsoft.com` (no `/.default` suffix). */
    resource: string
    /** Sovereign cloud override; defaults to the connection's cloud. */
    cloud?: string
  }): Promise<string>
}

export interface PipelineContext {
  appId: string
  customerId: string
  configTypeId: string
  canvas: CanvasSnapshot
  environment: EnvironmentRef
  user: UserRef
  settings: Record<string, unknown>
  platform: PlatformDataApi
  /**
   * App-only token broker for brokered (consent-onboarded) connections.
   * Optional so existing BYO-secret handlers and contexts are unaffected.
   */
  identity?: IdentityBroker
  /**
   * Resolved permission snapshot (R3, RBAC/IdP hardening 2026-07-10) of the
   * user who triggered this pipeline run — populated at every context
   * builder (validate, deploy, rollback, health check, drift detect) via
   * `resolvePermissionSnapshotForUser`. Apps can use this to make their own
   * handler-internal authorization decisions without querying the platform
   * DB directly (which they must never do — see PlatformDataApi).
   */
  permissions: PermissionSnapshot
}

export interface DeployContext extends PipelineContext {
  component: ComponentRef
  credential: CredentialRef | null
  connectivity: ConnectivityRef | null
  connectivityProvider: ConnectivityProviderRef | null
  previousConfig: CanvasSnapshot | null
  strategy: DeploymentStrategy
  canaryPercent?: number
}

export interface RollbackContext extends PipelineContext {
  component: ComponentRef
  credential: CredentialRef | null
  connectivity: ConnectivityRef | null
  connectivityProvider: ConnectivityProviderRef | null
  rollbackData: unknown
  targetVersion: CanvasSnapshot
}

export interface HealthCheckContext extends PipelineContext {
  component: ComponentRef
  credential: CredentialRef | null
  connectivity: ConnectivityRef | null
  connectivityProvider: ConnectivityProviderRef | null
}

export interface DriftContext extends PipelineContext {
  component: ComponentRef
  credential: CredentialRef | null
  connectivity: ConnectivityRef | null
  connectivityProvider: ConnectivityProviderRef | null
  deployedConfig: CanvasSnapshot
}

// --- Reference Types (lightweight refs passed to handlers) ---

export interface CanvasSnapshot {
  id: string
  canvasId: string
  version: number
  name: string
  toolType: string
  entityType: string
  /**
   * The items this configuration declares — one per object to create in the
   * target tool (N indexes, N IOCs). This is the canonical list.
   */
  items: CanvasItemSnapshot[]
  /** @deprecated Alias of `items`, kept so handlers written against the old contract keep working. */
  sections: CanvasSectionSnapshot[]
  snapshot: Record<string, unknown> // Full raw snapshot from history
}

/**
 * One item. `fields` is flat across the item's presentational groups, so a
 * handler reads every field it was given regardless of how the UI laid them out.
 */
export interface CanvasItemSnapshot {
  /** Stable identity for diffs. Always set by the platform; optional so a
   *  handler's own test fixtures need not invent one. */
  id?: string
  name: string
  fields: Record<string, unknown>
}

export type CanvasSectionSnapshot = CanvasItemSnapshot

export interface EnvironmentRef {
  id: string
  name: string
}

export interface UserRef {
  id: string
  email: string
  name: string | null
}

export interface ComponentRef {
  id: string
  hostname: string
  port: string
  type: string[]
  toolId: string
}

export interface CredentialRef {
  id: string
  name: string
  username: string
  password: string
  apiToken: string | null
  certificate: string | null
}

export interface ConnectivityRef {
  id: string
  status: string
  sshCommand: string | null
  httpsUrl: string | null
  tailscaleDeviceIP: string | null
}

/** Provider-aware connectivity passed to handlers when a ConnectivityProvider is configured */
export interface ConnectivityProviderRef {
  id: string
  providerType: string  // 'tailscale' | 'ssh' | 'wireguard' | 'cloudflare_tunnel' | etc.
  name: string
  status: string
  config: Record<string, unknown>  // Unmasked config for handler use (server-side only)
}

// --- Platform Data Access (tenant-scoped, read-only API for app handlers) ---

/** Summary of a deployment record, returned by PlatformDataApi */
export interface DeploymentSummary {
  id: string
  canvasId: string
  status: string
  healthScore: number | null
  startedAt: string
  completedAt: string | null
  environment: EnvironmentRef
}

/**
 * Read-only data access handed to app handlers as `ctx.platform`.
 * This is the only supported way for apps to read platform records —
 * apps must never import the platform's Prisma client directly.
 * Every method is scoped to the customer the pipeline run belongs to.
 */
export interface PlatformDataApi {
  /** Latest deployment for a canvas, optionally filtered by status (e.g. 'SUCCEEDED'). */
  getLatestDeployment(
    canvasId: string,
    opts?: { status?: string },
  ): Promise<DeploymentSummary | null>
  /** Components for the current customer, optionally filtered by component types. */
  listComponents(filter?: { types?: string[] }): Promise<ComponentRef[]>
}

// --- Handler contract (imported from the SDK, the app-facing contract) ---
//
// `HANDLER_NAMES` comes straight from @veltrixsecops/app-sdk — the same package
// app authors code against — so the platform and apps can never drift.
//
// This is only safe because the SDK's root entry is React-free as of 2.0.0
// (its React hooks live at `@veltrixsecops/app-sdk/hooks`). Pipeline handlers
// execute in a bare Node child process with a scrubbed environment; a root
// entry that pulled in React would be unloadable there. Do not import the
// `/hooks` or `/client` subpaths from server code.

export { HANDLER_NAMES } from '@veltrixsecops/app-sdk'
export type { HandlerName } from '@veltrixsecops/app-sdk'

import { HANDLER_NAMES as SDK_HANDLER_NAMES } from '@veltrixsecops/app-sdk'
import type { HandlerName as SdkHandlerName } from '@veltrixsecops/app-sdk'

/** Handlers a manifest MUST declare (`driftDetect` is optional). */
export const REQUIRED_HANDLER_NAMES = SDK_HANDLER_NAMES.filter(
  (name) => name !== 'driftDetect',
) as ReadonlyArray<SdkHandlerName>

/**
 * Handlers that may be invoked inside a sandbox. `deploy` and `rollback` are
 * excluded on purpose: they mutate external systems.
 */
export const RUNNABLE_HANDLER_NAMES = SDK_HANDLER_NAMES.filter(
  (name) => name !== 'deploy' && name !== 'rollback',
) as ReadonlyArray<SdkHandlerName>

// --- Pipeline Handler Interfaces (what apps implement) ---

export type ValidateHandler = (ctx: PipelineContext) => Promise<ValidationResult>
export type DeployHandler = (ctx: DeployContext) => Promise<DeployResult>
export type RollbackHandler = (ctx: RollbackContext) => Promise<RollbackResult>
export type HealthCheckHandler = (ctx: HealthCheckContext) => Promise<HealthCheckResult>
export type DriftDetectHandler = (ctx: DriftContext) => Promise<DriftResult>
export type GetStatusHandler = (ctx: PipelineContext) => Promise<ConfigStatus>

export interface PipelineHandlers {
  validate: ValidateHandler
  deploy: DeployHandler
  rollback: RollbackHandler
  healthCheck: HealthCheckHandler
  driftDetect?: DriftDetectHandler
  getStatus: GetStatusHandler
}

// --- Pipeline Job Types (for BullMQ) ---

export interface ValidateJobData {
  canvasId: string
  customerId: string
  userId: string
}

export interface DeployJobData {
  deploymentId: string
  canvasId: string
  historyId: string
  environmentId: string
  customerId: string
  appId: string
  configTypeId: string
  strategy: DeploymentStrategy
  triggeredById: string
}

export interface HealthCheckJobData {
  deploymentId: string
  appId: string
  configTypeId: string
  customerId: string
  environmentId: string
}

export interface DriftDetectJobData {
  appId: string
  configTypeId: string
  customerId: string
  environmentId: string
}

export interface RollbackJobData {
  deploymentId: string
  reason: string
  triggeredById: string
}

// Re-export shared types for convenience
export type {
  ValidationResult,
  DeployResult,
  HealthCheckResult,
  RollbackResult,
  DriftResult,
  DriftDiff,
  ConfigStatus,
  ComponentConfigStatus,
  DeploymentStrategy,
}

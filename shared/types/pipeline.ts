// ========================================================================
// Security-as-Code Pipeline Types
// Shared between server, client, and app-sdk
// ========================================================================

// --- Pipeline Status Flow ---

export type ConfigCanvasStatus =
  | 'DRAFT'
  | 'VALIDATION_PENDING'
  | 'VALIDATION_FAILED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'DEPLOYMENT_QUEUED'
  | 'DEPLOYING'
  | 'DEPLOYMENT_PAUSED'
  | 'DEPLOYED'
  | 'DEPLOYMENT_FAILED'
  | 'ROLLED_BACK'
  | 'ARCHIVED'

export type DeploymentStrategy = 'DIRECT' | 'CANARY' | 'BLUE_GREEN' | 'ROLLING'

export type DeploymentStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'HEALTH_CHECKING'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type DriftSeverity = 'info' | 'warning' | 'critical'

// --- Validation ---

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  code: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

// --- Deployment ---

export interface DeployResult {
  success: boolean
  message: string
  artifacts?: Record<string, unknown>
  rollbackData?: unknown
}

// --- Health Check ---

export interface HealthCheck {
  name: string
  passed: boolean
  message: string
  latencyMs?: number
}

export interface HealthCheckResult {
  healthy: boolean
  score: number // 0-100
  checks: HealthCheck[]
}

// --- Rollback ---

export interface RollbackResult {
  success: boolean
  message: string
}

// --- Drift Detection ---

/**
 * Best-effort attribution for a drifting change: WHO changed the target outside
 * Veltrix, and WHEN, resolved from the tool's own audit/system log (e.g. Okta's
 * System Log). All fields optional — a tool without an audit API, or a change we
 * can't correlate, simply omits it.
 */
export interface DriftActor {
  /** Provider-native actor id (Okta user id, etc.). */
  id?: string
  /** Human-facing name of who made the change. */
  name?: string
  /** Actor email / login, when available. */
  email?: string
  /** ISO timestamp the change was actually made (not when Veltrix detected it). */
  at?: string
  /** Provider event type behind the change, e.g. "group.lifecycle.update". */
  eventType?: string
  /** Where the attribution came from, e.g. "okta-system-log". */
  source?: string
}

export interface DriftDiff {
  field: string
  expected: unknown
  actual: unknown
  severity: DriftSeverity
  /** Who made this change + when, when the tool's audit log lets us attribute it. */
  actor?: DriftActor
}

export interface DriftResult {
  hasDrift: boolean
  diffs: DriftDiff[]
}

// --- Config Status ---

export interface ComponentConfigStatus {
  componentId: string
  hostname: string
  deployed: boolean
  version?: string
  lastDeployedAt?: string
  healthy?: boolean
  healthScore?: number
}

export interface ConfigStatus {
  deployed: boolean
  version: string
  lastDeployedAt: string
  componentStatuses: ComponentConfigStatus[]
}

// --- Environment Policy ---

export interface EnvironmentPolicyConfig {
  requireApproval: boolean
  minApprovers: number
  requiredApproverRoles: string[]
  deploymentStrategy: DeploymentStrategy
  canarySteps: number[]
  healthCheckTimeout: number
  autoRollbackOnError: boolean
  errorRateThreshold: number
  requirePreviousEnv: boolean
  previousEnvTagId?: string
}

// --- Deployment Progress (real-time) ---

export interface DeploymentProgress {
  deploymentId: string
  status: DeploymentStatus
  canaryPercent?: number
  healthScore?: number
  errorRate?: number
  currentStep: string
  totalComponents: number
  completedComponents: number
  logs: DeploymentLogEntry[]
}

export interface DeploymentLogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// --- Pipeline Summary (dashboard) ---

export interface PipelineSummary {
  pendingValidations: number
  pendingApprovals: number
  activeDeployments: number
  failedDeployments: number
  unresolvedDrifts: number
}

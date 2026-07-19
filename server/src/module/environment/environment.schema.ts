// Environment (Tag) management types + shared constants.
//
// An "environment" is a customer Tag row. This thin module layers ownership
// (Tag.ownerId) and per-environment deployment policy (EnvironmentPolicy, the
// appId = null / global row) on top of the existing Tag CRUD, exposing them as
// a single pipeline-scoped resource.

export const DEPLOYMENT_STRATEGIES = ['DIRECT', 'CANARY', 'BLUE_GREEN', 'ROLLING'] as const;
export type DeploymentStrategyValue = (typeof DEPLOYMENT_STRATEGIES)[number];

// Mirrors the Prisma schema defaults for EnvironmentPolicy so GET returns a
// coherent shape even when no policy row exists yet.
export const DEFAULT_POLICY = {
  requireApproval: true,
  minApprovers: 1,
  requiredApproverRoles: [] as string[],
  deploymentStrategy: 'ROLLING' as DeploymentStrategyValue,
  canarySteps: [10, 25, 50, 100] as number[],
  healthCheckTimeout: 300,
  autoRollbackOnError: true,
  errorRateThreshold: 5.0,
  requirePreviousEnv: false,
  previousEnvTagId: null as string | null,
};

// ---- Request payloads -----------------------------------------------------

export interface CreateEnvironmentBody {
  name: string;
  ownerId?: string | null;
}

export interface UpdateEnvironmentBody {
  name?: string;
  ownerId?: string | null;
}

export interface UpdatePolicyBody {
  requireApproval?: boolean;
  minApprovers?: number;
  requiredApproverRoles?: string[];
  deploymentStrategy?: DeploymentStrategyValue;
  canarySteps?: number[];
  healthCheckTimeout?: number;
  autoRollbackOnError?: boolean;
  errorRateThreshold?: number;
  requirePreviousEnv?: boolean;
  previousEnvTagId?: string | null;
}

// ---- Response shapes ------------------------------------------------------

export interface EnvironmentOwner {
  id: string;
  name: string | null;
  email: string;
}

export interface EnvironmentPolicyResponse {
  id: string | null;
  tagId: string;
  appId: string | null;
  requireApproval: boolean;
  minApprovers: number;
  requiredApproverRoles: string[];
  deploymentStrategy: DeploymentStrategyValue;
  canarySteps: number[];
  healthCheckTimeout: number;
  autoRollbackOnError: boolean;
  errorRateThreshold: number;
  requirePreviousEnv: boolean;
  previousEnvTagId: string | null;
  isDefault: boolean;
}

export interface EnvironmentRecord {
  id: string;
  name: string;
  ownerId: string | null;
  owner: EnvironmentOwner | null;
  policy: EnvironmentPolicyResponse | null;
  deploymentCount: number;
  canvasCount: number;
}

// ---- Params ---------------------------------------------------------------

export interface EnvironmentIdParams {
  id: string;
}

// Typed error carrying an HTTP status so the controller can map cleanly.
export class EnvironmentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'EnvironmentError';
    this.statusCode = statusCode;
  }
}

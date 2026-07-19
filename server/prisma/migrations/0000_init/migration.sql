-- Veltrix Community Edition — initial baseline migration.
--
-- Generated with:
--   prisma migrate diff --from-empty --to-schema-datamodel server/prisma/schema.prisma --script
--
-- This is the ONLY migration in this repo's history. The private Veltrix
-- monorepo has 60+ historical migrations that create-then-mutate commercial
-- tables (Stripe billing, MSSP, IPAM, hosted ZTNA); porting that history
-- would leak the excluded commercial schema into this OSS release. Instead,
-- this single baseline is generated straight from the pruned
-- server/prisma/schema.prisma, matching it exactly. Apply with:
--   pnpm --filter ./server prisma:migrate   (dev, creates + applies)
--   npx prisma migrate deploy               (prod, applies only)

-- CreateEnum
CREATE TYPE "ConfigActionType" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'APPROVED', 'REJECTED', 'DEPLOYED', 'REVERTED', 'RESTORED');

-- CreateEnum
CREATE TYPE "ConfigCanvasStatus" AS ENUM ('DRAFT', 'VALIDATION_PENDING', 'VALIDATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'DEPLOYMENT_QUEUED', 'DEPLOYING', 'DEPLOYMENT_PAUSED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK', 'ARCHIVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppSource" AS ENUM ('BUILT_IN', 'MARKETPLACE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('AVAILABLE', 'DEPRECATED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AppInstallationStatus" AS ENUM ('INSTALLING', 'INSTALLED', 'ENABLED', 'DISABLED', 'FAILED', 'UNINSTALLING');

-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('DIRECT', 'CANARY', 'BLUE_GREEN', 'ROLLING');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'HEALTH_CHECKING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'ROLLING_BACK', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "SandboxStatus" AS ENUM ('ACTIVE', 'SYNCING', 'ERROR', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ComplianceControlState" AS ENUM ('COMPLIANT', 'NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "description" TEXT,
    "email" TEXT,
    "industry" TEXT,
    "logo" TEXT,
    "phone" TEXT,
    "state" TEXT,
    "website" TEXT,
    "zipCode" TEXT,
    "shortName" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleId" TEXT NOT NULL,
    "authProvider" TEXT DEFAULT 'LOCAL',
    "providerAccountId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPassword" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPassword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifications" JSONB NOT NULL DEFAULT '{"email": true, "mobile": false, "browser": true}',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorPendingSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "appId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "logoUrl" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTool" (
    "customerId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTool_pkey" PRIMARY KEY ("customerId","toolId")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "apiKey" TEXT,
    "endpoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "config" JSONB,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "apiToken" TEXT,
    "toolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT,
    "certificate" TEXT,
    "endpoint" TEXT,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialTag" (
    "credentialId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "CredentialTag_pkey" PRIMARY KEY ("credentialId","tagId")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "type" TEXT[],
    "hostname" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ipRanges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "toolId" TEXT NOT NULL,
    "connectivityProviderId" TEXT,
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentConnectivity" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "sshCommand" TEXT,
    "httpsUrl" TEXT,
    "tailscaleKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tailscaleDeviceId" TEXT,
    "tailscaleDeviceIP" TEXT,

    CONSTRAINT "ComponentConnectivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailscaleDevice" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "preAuthKey" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TailscaleDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailscaleConfig" (
    "id" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL DEFAULT 'https://api.tailscale.com/api/v2',
    "tailnet" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TailscaleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectivityProvider" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "statusMessage" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectivityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentTag" (
    "componentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ComponentTag_pkey" PRIMARY KEY ("componentId","tagId")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownership" TEXT NOT NULL DEFAULT 'tenant',

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogForwardingDestination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastSync" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogForwardingDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIdentityProvider" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerIdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationHistory" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "ConfigActionType" NOT NULL,
    "deployState" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT,
    "details" JSONB,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "ConfigurationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfiguration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "lastModifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAlert" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "customerId" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "toolType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" "ConfigCanvasStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasTag" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationCanvasTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasSection" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationCanvasSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "value" JSONB,
    "defaultValue" JSONB,
    "group" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "helpText" TEXT,
    "options" JSONB,
    "validation" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationCanvasField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasHistory" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" "ConfigActionType" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationCanvasHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasApproval" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "submissionComment" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationCanvasApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasApprovalEnvironment" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationCanvasApprovalEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationCanvasComment" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "historyId" TEXT,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigurationCanvasComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "logo" TEXT,
    "license" TEXT,
    "homepage" TEXT,
    "repository" TEXT,
    "manifestPath" TEXT NOT NULL,
    "source" "AppSource" NOT NULL DEFAULT 'BUILT_IN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "AppStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppInstallation" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installedBy" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "AppInstallationStatus" NOT NULL DEFAULT 'INSTALLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPermissionDefinition" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AppPermissionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettingDefinition" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "defaultValue" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,

    CONSTRAINT "AppSettingDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfigurationType" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "configTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templatePath" TEXT NOT NULL,
    "defaultPath" TEXT,
    "componentTypes" TEXT[],
    "requiresCred" BOOLEAN NOT NULL DEFAULT true,
    "requiresConnect" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AppConfigurationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "strategy" "DeploymentStrategy" NOT NULL DEFAULT 'ROLLING',
    "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "canaryPercent" INTEGER,
    "healthScore" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "previousDeploymentId" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "rollbackData" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "triggeredById" TEXT NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentLog" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentPolicy" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appId" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "minApprovers" INTEGER NOT NULL DEFAULT 1,
    "requiredApproverRoles" TEXT[],
    "deploymentStrategy" "DeploymentStrategy" NOT NULL DEFAULT 'ROLLING',
    "canarySteps" INTEGER[] DEFAULT ARRAY[10, 25, 50, 100]::INTEGER[],
    "healthCheckTimeout" INTEGER NOT NULL DEFAULT 300,
    "autoRollbackOnError" BOOLEAN NOT NULL DEFAULT true,
    "errorRateThreshold" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "requirePreviousEnv" BOOLEAN NOT NULL DEFAULT false,
    "previousEnvTagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriftRecord" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "configTypeId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "componentId" TEXT,
    "severity" TEXT NOT NULL,
    "diffs" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAction" TEXT,

    CONSTRAINT "DriftRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sandbox" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" "SandboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sandbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceFramework" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceControl" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceControlStatus" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "status" "ComplianceControlState" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "evidence" TEXT,
    "remediation" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "assessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceControlStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_domain_key" ON "Organization"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_shortName_key" ON "Organization"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_customerId_idx" ON "User"("customerId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_isPlatformAdmin_idx" ON "User"("isPlatformAdmin");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_providerAccountId_idx" ON "User"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPassword_userId_key" ON "UserPassword"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "Role_customerId_idx" ON "Role"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_customerId_key" ON "Role"("name", "customerId");

-- CreateIndex
CREATE INDEX "Permission_roleId_idx" ON "Permission"("roleId");

-- CreateIndex
CREATE INDEX "Permission_appId_idx" ON "Permission"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_roleId_appId_key" ON "Permission"("resource", "action", "roleId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");

-- CreateIndex
CREATE INDEX "CustomerTool_customerId_idx" ON "CustomerTool"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTool_toolId_idx" ON "CustomerTool"("toolId");

-- CreateIndex
CREATE INDEX "Integration_toolId_idx" ON "Integration"("toolId");

-- CreateIndex
CREATE INDEX "Tag_customerId_idx" ON "Tag"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_customerId_key" ON "Tag"("name", "customerId");

-- CreateIndex
CREATE INDEX "Credential_toolId_idx" ON "Credential"("toolId");

-- CreateIndex
CREATE INDEX "Credential_customerId_idx" ON "Credential"("customerId");

-- CreateIndex
CREATE INDEX "CredentialTag_tagId_idx" ON "CredentialTag"("tagId");

-- CreateIndex
CREATE INDEX "Component_toolId_idx" ON "Component"("toolId");

-- CreateIndex
CREATE INDEX "Component_customerId_idx" ON "Component"("customerId");

-- CreateIndex
CREATE INDEX "Component_connectivityProviderId_idx" ON "Component"("connectivityProviderId");

-- CreateIndex
CREATE INDEX "Component_credentialId_idx" ON "Component"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentConnectivity_componentId_key" ON "ComponentConnectivity"("componentId");

-- CreateIndex
CREATE INDEX "TailscaleDevice_hostname_idx" ON "TailscaleDevice"("hostname");

-- CreateIndex
CREATE INDEX "ConnectivityProvider_customerId_idx" ON "ConnectivityProvider"("customerId");

-- CreateIndex
CREATE INDEX "ConnectivityProvider_customerId_isDefault_idx" ON "ConnectivityProvider"("customerId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectivityProvider_customerId_providerType_name_key" ON "ConnectivityProvider"("customerId", "providerType", "name");

-- CreateIndex
CREATE INDEX "ComponentTag_tagId_idx" ON "ComponentTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_customerId_idx" ON "ApiKey"("customerId");

-- CreateIndex
CREATE INDEX "ApiKey_roleId_idx" ON "ApiKey"("roleId");

-- CreateIndex
CREATE INDEX "LogForwardingDestination_customerId_idx" ON "LogForwardingDestination"("customerId");

-- CreateIndex
CREATE INDEX "LogEntry_customerId_idx" ON "LogEntry"("customerId");

-- CreateIndex
CREATE INDEX "LogEntry_timestamp_idx" ON "LogEntry"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_type_key" ON "IdentityProvider"("type");

-- CreateIndex
CREATE INDEX "CustomerIdentityProvider_customerId_idx" ON "CustomerIdentityProvider"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentityProvider_customerId_type_key" ON "CustomerIdentityProvider"("customerId", "type");

-- CreateIndex
CREATE INDEX "ConfigurationHistory_customerId_idx" ON "ConfigurationHistory"("customerId");

-- CreateIndex
CREATE INDEX "ConfigurationHistory_userId_idx" ON "ConfigurationHistory"("userId");

-- CreateIndex
CREATE INDEX "ConfigurationHistory_entityType_entityId_idx" ON "ConfigurationHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConfigurationHistory_timestamp_idx" ON "ConfigurationHistory"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfiguration_key_key" ON "PlatformConfiguration"("key");

-- CreateIndex
CREATE INDEX "PlatformConfiguration_category_idx" ON "PlatformConfiguration"("category");

-- CreateIndex
CREATE INDEX "PlatformAlert_severity_idx" ON "PlatformAlert"("severity");

-- CreateIndex
CREATE INDEX "PlatformAlert_isResolved_idx" ON "PlatformAlert"("isResolved");

-- CreateIndex
CREATE INDEX "PlatformAlert_createdAt_idx" ON "PlatformAlert"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConfigurationCanvas_customerId_idx" ON "ConfigurationCanvas"("customerId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvas_createdById_idx" ON "ConfigurationCanvas"("createdById");

-- CreateIndex
CREATE INDEX "ConfigurationCanvas_toolType_entityType_idx" ON "ConfigurationCanvas"("toolType", "entityType");

-- CreateIndex
CREATE INDEX "ConfigurationCanvas_status_idx" ON "ConfigurationCanvas"("status");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasTag_canvasId_idx" ON "ConfigurationCanvasTag"("canvasId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasTag_tagId_idx" ON "ConfigurationCanvasTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationCanvasTag_canvasId_tagId_key" ON "ConfigurationCanvasTag"("canvasId", "tagId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasSection_canvasId_idx" ON "ConfigurationCanvasSection"("canvasId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasSection_order_idx" ON "ConfigurationCanvasSection"("order");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasField_sectionId_idx" ON "ConfigurationCanvasField"("sectionId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasField_order_idx" ON "ConfigurationCanvasField"("order");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasHistory_canvasId_idx" ON "ConfigurationCanvasHistory"("canvasId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasHistory_version_idx" ON "ConfigurationCanvasHistory"("version");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasHistory_createdAt_idx" ON "ConfigurationCanvasHistory"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConfigurationCanvasApproval_canvasId_idx" ON "ConfigurationCanvasApproval"("canvasId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasApproval_approverId_idx" ON "ConfigurationCanvasApproval"("approverId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasApproval_status_idx" ON "ConfigurationCanvasApproval"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationCanvasApproval_canvasId_approverId_key" ON "ConfigurationCanvasApproval"("canvasId", "approverId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasApprovalEnvironment_approvalId_idx" ON "ConfigurationCanvasApprovalEnvironment"("approvalId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasApprovalEnvironment_tagId_idx" ON "ConfigurationCanvasApprovalEnvironment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationCanvasApprovalEnvironment_approvalId_tagId_key" ON "ConfigurationCanvasApprovalEnvironment"("approvalId", "tagId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasComment_canvasId_idx" ON "ConfigurationCanvasComment"("canvasId");

-- CreateIndex
CREATE INDEX "ConfigurationCanvasComment_historyId_idx" ON "ConfigurationCanvasComment"("historyId");

-- CreateIndex
CREATE UNIQUE INDEX "App_appId_key" ON "App"("appId");

-- CreateIndex
CREATE INDEX "App_source_idx" ON "App"("source");

-- CreateIndex
CREATE INDEX "App_category_idx" ON "App"("category");

-- CreateIndex
CREATE INDEX "AppInstallation_customerId_idx" ON "AppInstallation"("customerId");

-- CreateIndex
CREATE INDEX "AppInstallation_status_idx" ON "AppInstallation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AppInstallation_appId_customerId_key" ON "AppInstallation"("appId", "customerId");

-- CreateIndex
CREATE INDEX "AppPermissionDefinition_appId_idx" ON "AppPermissionDefinition"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "AppPermissionDefinition_appId_resource_action_key" ON "AppPermissionDefinition"("appId", "resource", "action");

-- CreateIndex
CREATE INDEX "AppSettingDefinition_appId_idx" ON "AppSettingDefinition"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettingDefinition_appId_key_key" ON "AppSettingDefinition"("appId", "key");

-- CreateIndex
CREATE INDEX "AppConfigurationType_appId_idx" ON "AppConfigurationType"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfigurationType_appId_configTypeId_key" ON "AppConfigurationType"("appId", "configTypeId");

-- CreateIndex
CREATE INDEX "Deployment_canvasId_environmentId_idx" ON "Deployment"("canvasId", "environmentId");

-- CreateIndex
CREATE INDEX "Deployment_customerId_status_idx" ON "Deployment"("customerId", "status");

-- CreateIndex
CREATE INDEX "Deployment_appId_idx" ON "Deployment"("appId");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "Deployment_startedAt_idx" ON "Deployment"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "DeploymentLog_deploymentId_idx" ON "DeploymentLog"("deploymentId");

-- CreateIndex
CREATE INDEX "DeploymentLog_timestamp_idx" ON "DeploymentLog"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "EnvironmentPolicy_customerId_idx" ON "EnvironmentPolicy"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentPolicy_tagId_customerId_appId_key" ON "EnvironmentPolicy"("tagId", "customerId", "appId");

-- CreateIndex
CREATE INDEX "DriftRecord_customerId_isResolved_idx" ON "DriftRecord"("customerId", "isResolved");

-- CreateIndex
CREATE INDEX "DriftRecord_appId_environmentId_idx" ON "DriftRecord"("appId", "environmentId");

-- CreateIndex
CREATE INDEX "DriftRecord_detectedAt_idx" ON "DriftRecord"("detectedAt" DESC);

-- CreateIndex
CREATE INDEX "Sandbox_customerId_idx" ON "Sandbox"("customerId");

-- CreateIndex
CREATE INDEX "Sandbox_status_expiresAt_idx" ON "Sandbox"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sandbox_customerId_name_key" ON "Sandbox"("customerId", "name");

-- CreateIndex
CREATE INDEX "UserSession_customerId_idx" ON "UserSession"("customerId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_createdAt_idx" ON "UserSession"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_customerId_idx" ON "AuditEvent"("customerId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_idx" ON "AuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_idx" ON "AuditEvent"("resourceType");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFramework_key_key" ON "ComplianceFramework"("key");

-- CreateIndex
CREATE INDEX "ComplianceControl_frameworkId_idx" ON "ComplianceControl"("frameworkId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceControl_frameworkId_code_key" ON "ComplianceControl"("frameworkId", "code");

-- CreateIndex
CREATE INDEX "ComplianceControlStatus_customerId_idx" ON "ComplianceControlStatus"("customerId");

-- CreateIndex
CREATE INDEX "ComplianceControlStatus_controlId_idx" ON "ComplianceControlStatus"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceControlStatus_customerId_controlId_key" ON "ComplianceControlStatus"("customerId", "controlId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPassword" ADD CONSTRAINT "UserPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTool" ADD CONSTRAINT "CustomerTool_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTool" ADD CONSTRAINT "CustomerTool_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialTag" ADD CONSTRAINT "CredentialTag_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialTag" ADD CONSTRAINT "CredentialTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_connectivityProviderId_fkey" FOREIGN KEY ("connectivityProviderId") REFERENCES "ConnectivityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentConnectivity" ADD CONSTRAINT "ComponentConnectivity_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectivityProvider" ADD CONSTRAINT "ConnectivityProvider_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTag" ADD CONSTRAINT "ComponentTag_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentTag" ADD CONSTRAINT "ComponentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogForwardingDestination" ADD CONSTRAINT "LogForwardingDestination_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerIdentityProvider" ADD CONSTRAINT "CustomerIdentityProvider_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationHistory" ADD CONSTRAINT "ConfigurationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationHistory" ADD CONSTRAINT "ConfigurationHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformConfiguration" ADD CONSTRAINT "PlatformConfiguration_lastModifiedBy_fkey" FOREIGN KEY ("lastModifiedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAlert" ADD CONSTRAINT "PlatformAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAlert" ADD CONSTRAINT "PlatformAlert_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvas" ADD CONSTRAINT "ConfigurationCanvas_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvas" ADD CONSTRAINT "ConfigurationCanvas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvas" ADD CONSTRAINT "ConfigurationCanvas_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasTag" ADD CONSTRAINT "ConfigurationCanvasTag_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasTag" ADD CONSTRAINT "ConfigurationCanvasTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasSection" ADD CONSTRAINT "ConfigurationCanvasSection_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasField" ADD CONSTRAINT "ConfigurationCanvasField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ConfigurationCanvasSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasHistory" ADD CONSTRAINT "ConfigurationCanvasHistory_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasHistory" ADD CONSTRAINT "ConfigurationCanvasHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasApproval" ADD CONSTRAINT "ConfigurationCanvasApproval_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasApproval" ADD CONSTRAINT "ConfigurationCanvasApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasApprovalEnvironment" ADD CONSTRAINT "ConfigurationCanvasApprovalEnvironment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ConfigurationCanvasApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasApprovalEnvironment" ADD CONSTRAINT "ConfigurationCanvasApprovalEnvironment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasComment" ADD CONSTRAINT "ConfigurationCanvasComment_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasComment" ADD CONSTRAINT "ConfigurationCanvasComment_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "ConfigurationCanvasHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasComment" ADD CONSTRAINT "ConfigurationCanvasComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationCanvasComment" ADD CONSTRAINT "ConfigurationCanvasComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ConfigurationCanvasComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPermissionDefinition" ADD CONSTRAINT "AppPermissionDefinition_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettingDefinition" ADD CONSTRAINT "AppSettingDefinition_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppConfigurationType" ADD CONSTRAINT "AppConfigurationType_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_rolledBackById_fkey" FOREIGN KEY ("rolledBackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentLog" ADD CONSTRAINT "DeploymentLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentPolicy" ADD CONSTRAINT "EnvironmentPolicy_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentPolicy" ADD CONSTRAINT "EnvironmentPolicy_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriftRecord" ADD CONSTRAINT "DriftRecord_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriftRecord" ADD CONSTRAINT "DriftRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriftRecord" ADD CONSTRAINT "DriftRecord_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sandbox" ADD CONSTRAINT "Sandbox_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sandbox" ADD CONSTRAINT "Sandbox_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceControl" ADD CONSTRAINT "ComplianceControl_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ComplianceFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceControlStatus" ADD CONSTRAINT "ComplianceControlStatus_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceControlStatus" ADD CONSTRAINT "ComplianceControlStatus_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ComplianceControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceControlStatus" ADD CONSTRAINT "ComplianceControlStatus_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


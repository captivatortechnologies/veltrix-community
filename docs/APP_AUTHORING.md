# App Authoring

This guide walks through building an app (plugin) for the Veltrix Security-as-Code
platform. An app teaches Veltrix how to configure a specific security tool: it
declares configuration types and implements the six pipeline handlers that
validate, deploy, verify, and roll back that configuration.

> **Where apps live.** Apps are developed and distributed from the **separate
> community apps repository**, which also hosts the app-authoring SDK and CLI
> (scaffolding, local testing, and packaging). This document explains the app
> contract that the platform's app engine enforces. Use the apps repository's
> tooling to scaffold and publish; use this guide to understand what each piece
> means. At runtime, the app engine discovers installed apps from the directory
> configured by `APPS_DIR` (default `./apps`).

## App package structure

An app is a self-contained directory named after its app id:

```
my-security-tool/
  manifest.yaml
  handlers/
    <config-type>/
      validate.ts
      deploy.ts
      rollback.ts
      healthCheck.ts
      driftDetect.ts
      getStatus.ts
  server/
    index.ts
  hooks/
    onInstall.ts
    onUninstall.ts
  migrations/
    001_initial.sql
```

## 1. Define the manifest

`manifest.yaml` declares the app's metadata, configuration types, permissions,
settings, and UI:

```yaml
id: my-security-tool
name: My Security Tool
version: 1.0.0
description: Integration for My Security Tool
vendor: Your Company
category: security
icon: shield

configurationTypes:
  - id: policies
    name: Security Policies
    description: Manage security policies
    schema: handlers/policies/schema.json

permissions:
  - id: policies
    name: Manage Policies
    description: Create and deploy security policies

settings:
  - id: api_endpoint
    name: API Endpoint
    type: string
    required: true
  - id: api_key
    name: API Key
    type: secret          # stored encrypted at rest
    required: true

client:
  pages:
    - id: dashboard
      name: Dashboard
      path: /my-security-tool
      sidebar: true
      icon: shield

hooks:
  onInstall: hooks/onInstall.ts
  onUninstall: hooks/onUninstall.ts

database:
  migrations:
    - migrations/001_initial.sql
```

Settings of `type: secret` are encrypted at rest by the platform; never store
credentials in plaintext in your app.

## 2. Implement the pipeline handlers

Every configuration type needs all six handlers. Each handler receives a context
object:

```typescript
interface HandlerContext {
  canvasId: string
  customerId: string                  // the owning organization's id
  configuration: Record<string, any>  // the canvas configuration data
  environmentId?: string
  deploymentId?: string
  settings: Record<string, any>       // this organization's app settings
}
```

### validate.ts

Validates configuration before deployment. Return errors to block the pipeline.

```typescript
export default async function validate(ctx: HandlerContext) {
  const errors: string[] = []
  const warnings: string[] = []

  if (!ctx.configuration.name) {
    errors.push('Policy name is required')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
```

### deploy.ts

Deploys the configuration to the target system. Capture rollback data so the
change can be reverted.

```typescript
export default async function deploy(ctx: HandlerContext) {
  const { configuration, settings } = ctx

  // Capture current state for rollback
  const rollbackData = await getCurrentState(settings)

  // Deploy to target system
  await applyConfiguration(settings, configuration)

  return {
    success: true,
    rollbackData,
    metadata: { deployedAt: new Date().toISOString() },
  }
}
```

### rollback.ts

Restores the previous state from the rollback data captured during deploy.

```typescript
export default async function rollback(ctx: HandlerContext & { rollbackData: any }) {
  await restoreState(ctx.settings, ctx.rollbackData)
  return { success: true }
}
```

### healthCheck.ts

Verifies the target system is healthy. Return individual check results.

```typescript
export default async function healthCheck(ctx: HandlerContext) {
  const checks = [
    { name: 'api_reachable', status: 'healthy', latencyMs: 45 },
    { name: 'auth_valid', status: 'healthy', latencyMs: 12 },
  ]

  const healthy = checks.every(c => c.status === 'healthy')
  return {
    healthy,
    score: healthy ? 100 : 0,
    checks,
  }
}
```

### driftDetect.ts

Compares deployed configuration with the live state and reports differences.

```typescript
export default async function driftDetect(ctx: HandlerContext) {
  const drifts: Array<{ field: string; expected: any; actual: any; severity: string }> = []

  const liveState = await getLiveState(ctx.settings)

  if (liveState.name !== ctx.configuration.name) {
    drifts.push({
      field: 'name',
      expected: ctx.configuration.name,
      actual: liveState.name,
      severity: 'warning',
    })
  }

  return {
    hasDrift: drifts.length > 0,
    drifts,
  }
}
```

### getStatus.ts

Returns the current deployment status for the configuration type.

```typescript
export default async function getStatus(ctx: HandlerContext) {
  return {
    status: 'deployed',
    lastDeployedAt: new Date().toISOString(),
    components: [
      { name: 'policy-engine', type: 'service', status: 'running' },
    ],
  }
}
```

## 3. Add server routes (optional)

App-scoped routes for custom API endpoints:

```typescript
// server/index.ts
import { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance, opts: { ctx: any }) {
  fastify.get('/status', async (request, reply) => {
    reply.send({ status: 'ok' })
  })
}
```

These routes are automatically mounted under `/api/apps/<app-id>/`.

## 4. Add lifecycle hooks

```typescript
// hooks/onInstall.ts
export default async function onInstall(ctx: { customerId: string }) {
  // Seed default data, validate prerequisites, etc.
}

// hooks/onUninstall.ts
export default async function onUninstall(ctx: { customerId: string }) {
  // Clean up or preserve organization data
}
```

## 5. Database migrations

If your app needs its own tables, list SQL migrations in the manifest under
`database.migrations`. The platform runs them in an **isolated schema per app**,
so your app's tables never collide with the core schema or with other apps.

## 6. Canvas and UI

Declare `client.pages` in the manifest to add pages to the navigation. The canvas
renders configuration forms from your configuration type's JSON schema, so a
well-described schema is what your operators interact with when authoring
configuration.

## Reference and tooling

The community apps repository provides:

- an **app-authoring SDK** with the handler and manifest types,
- a **CLI** to scaffold, run, and package apps locally, and
- one or more **reference apps** that implement the full six-handler contract for
  a real security tool.

Start from the reference app, adapt the handlers to your target system, and use
the CLI to test against a local Veltrix instance before publishing.

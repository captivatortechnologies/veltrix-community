// ========================================================================
// App Manifest Parser
//
// Reads and validates manifest.yaml files from app directories.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { AppManifest } from '../../../../shared/types/app'
import { REQUIRED_HANDLER_NAMES } from '../pipeline-engine/types'

export function parseManifest(manifestPath: string): AppManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`)
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8')
  const data = yaml.load(raw) as Record<string, any>

  return validateManifest(data, manifestPath)
}

function validateManifest(data: Record<string, any>, filePath: string): AppManifest {
  const errors: string[] = []

  // Required top-level fields
  if (!data.id || typeof data.id !== 'string') errors.push('Missing or invalid "id"')
  if (!data.name || typeof data.name !== 'string') errors.push('Missing or invalid "name"')
  if (!data.version || typeof data.version !== 'string') errors.push('Missing or invalid "version"')
  if (!data.vendor || typeof data.vendor !== 'string') errors.push('Missing or invalid "vendor"')
  if (!data.description || typeof data.description !== 'string') errors.push('Missing or invalid "description"')
  if (!data.category || typeof data.category !== 'string') errors.push('Missing or invalid "category"')

  // Pipeline section is MANDATORY
  if (!data.pipeline) {
    errors.push('Missing "pipeline" section - every app must define pipeline integration')
  } else if (!data.pipeline.configurationTypes || !Array.isArray(data.pipeline.configurationTypes)) {
    errors.push('Missing "pipeline.configurationTypes" - every app must define at least one configuration type')
  } else {
    for (const ct of data.pipeline.configurationTypes) {
      if (!ct.id) errors.push(`Configuration type missing "id"`)
      if (!ct.name) errors.push(`Configuration type missing "name"`)
      if (!ct.canvasTemplate) errors.push(`Configuration type "${ct.id}" missing "canvasTemplate"`)
      if (!ct.handlers) {
        errors.push(`Configuration type "${ct.id}" missing "handlers"`)
      } else {
        // Single source of truth for the handler contract (mirrors the SDK)
        for (const handler of REQUIRED_HANDLER_NAMES) {
          if (!ct.handlers[handler]) {
            errors.push(`Configuration type "${ct.id}" missing required handler: "${handler}"`)
          }
        }
      }
    }
  }

  // Server entry point is MANDATORY
  if (!data.server?.entry) {
    errors.push('Missing "server.entry" - every app must have a server entry point')
  }

  // Permissions section
  if (!data.permissions) {
    errors.push('Missing "permissions" section')
  }

  if (errors.length > 0) {
    throw new Error(`Invalid manifest at ${filePath}:\n  - ${errors.join('\n  - ')}`)
  }

  // Build the validated manifest
  const manifest: AppManifest = {
    id: data.id,
    name: data.name,
    version: data.version,
    vendor: data.vendor,
    description: data.description,
    category: data.category,
    license: data.license,
    homepage: data.homepage,
    icon: data.icon,
    logo: data.logo,

    platform: {
      minVersion: data.platform?.minVersion || '1.0.0',
    },

    permissions: {
      platform: data.permissions?.platform || [],
      app: (data.permissions?.app || []).map((p: any) => ({
        resource: p.resource,
        actions: p.actions || [],
        description: p.description,
      })),
    },

    database: data.database
      ? {
          migrations: data.database.migrations,
          tablePrefix: data.database.tablePrefix,
          isolation: data.database.isolation,
        }
      : undefined,

    pipeline: {
      configurationTypes: (data.pipeline?.configurationTypes || []).map((ct: any) => ({
        id: ct.id,
        name: ct.name,
        description: ct.description,
        group: ct.group,
        canvasTemplate: ct.canvasTemplate,
        defaultConfig: ct.defaultConfig,
        handlers: {
          validate: ct.handlers.validate,
          deploy: ct.handlers.deploy,
          rollback: ct.handlers.rollback,
          healthCheck: ct.handlers.healthCheck,
          driftDetect: ct.handlers.driftDetect || null,
          getStatus: ct.handlers.getStatus,
          options: ct.handlers.options || null,
        },
        targets: {
          componentTypes: ct.targets?.componentTypes || [],
          requiresCredential: ct.targets?.requiresCredential ?? true,
          requiresConnectivity: ct.targets?.requiresConnectivity ?? true,
        },
      })),
      pipelineEvents: data.pipeline?.pipelineEvents || [],
    },

    server: {
      entry: data.server.entry,
      routes: data.server.routes
        ? { prefix: data.server.routes.prefix }
        : undefined,
    },

    client: data.client
      ? {
          entry: data.client.entry,
          // Preserve the nav-layout choice so /enabled can expose it (the
          // parser rebuilds `client` explicitly, so unlisted fields are dropped).
          navLayout: data.client.navLayout === 'sidebar' ? 'sidebar' : 'tabs',
          pages: (data.client.pages || []).map((p: any) => ({
            path: p.path,
            component: p.component,
            label: p.label,
            description: p.description,
            icon: p.icon,
            // `sidebar` is the legacy switch; `nav` supersedes it.
            sidebar: p.sidebar ?? false,
            nav: p.nav ?? (p.sidebar ? 'sidebar' : 'hidden'),
            parent: p.parent,
            group: p.group,
            order: typeof p.order === 'number' ? p.order : undefined,
            layout: p.layout ?? 'standard',
            requiresPermission: p.requiresPermission
              ? { resource: p.requiresPermission.resource, action: p.requiresPermission.action }
              : undefined,
          })),
        }
      : undefined,

    // Brand identity — passed through verbatim; the branding route and the
    // /enabled payload builder validate colors/paths before anything is
    // served (and vetting rejects malformed declarations at install time).
    branding: data.branding
      ? {
          primaryColor: data.branding.primaryColor,
          accentColor: data.branding.accentColor,
          logo: data.branding.logo,
          logoDark: data.branding.logoDark,
        }
      : undefined,

    hooks: data.hooks
      ? {
          onInstall: data.hooks.onInstall,
          onUninstall: data.hooks.onUninstall,
          onEnable: data.hooks.onEnable,
          onDisable: data.hooks.onDisable,
          onUpgrade: data.hooks.onUpgrade,
          onWebhook: data.hooks.onWebhook,
          onEvent: data.hooks.onEvent,
        }
      : undefined,

    connectivity: data.connectivity
      ? { testHandler: data.connectivity.testHandler }
      : undefined,

    // Connection onboarding descriptor — passed through (mirroring the
    // connectivity.testHandler passthrough). The platform's onboarding module
    // + app-vetting validate the adapter/params; the parser only shapes it.
    connection:
      data.connection && data.connection.onboarding
        ? {
            onboarding: {
              provider: data.connection.onboarding.provider,
              label: data.connection.onboarding.label,
              onboardingHandler: data.connection.onboarding.onboardingHandler,
              params: data.connection.onboarding.params
                ? {
                    cloudSetting: data.connection.onboarding.params.cloudSetting,
                    requiredResourceAccess: (
                      data.connection.onboarding.params.requiredResourceAccess || []
                    ).map((r: any) => ({
                      resource: r.resource,
                      appPermissions: r.appPermissions || [],
                    })),
                    capture: data.connection.onboarding.params.capture
                      ? { tenantId: data.connection.onboarding.params.capture.tenantId }
                      : undefined,
                    brokered: data.connection.onboarding.params.brokered ?? false,
                    requiredSettings: data.connection.onboarding.params.requiredSettings || [],
                    provisioning: (data.connection.onboarding.params.provisioning || []).map(
                      (p: any) => ({
                        type: p.type,
                        role: p.role,
                        scope: p.scope,
                        armToken: p.armToken ?? 'manual',
                      }),
                    ),
                  }
                : undefined,
            },
          }
        : undefined,

    operations: Array.isArray(data.operations)
      ? data.operations.map((op: any) => ({
          id: op.id,
          name: op.name,
          description: op.description,
          handler: op.handler,
          destructive: op.destructive ?? false,
          requiresCredential: op.requiresCredential ?? true,
        }))
      : undefined,

    events: data.events || [],
    settings: (data.settings || []).map((s: any) => ({
      key: s.key,
      type: s.type,
      label: s.label,
      description: s.description,
      default: s.default,
      required: s.required ?? false,
      options: s.options,
    })),
  }

  return manifest
}

/**
 * Discover all app manifests in a directory.
 * Scans for manifest.yaml files one level deep.
 */
export function discoverManifests(appsDir: string): Array<{ manifest: AppManifest; dir: string }> {
  if (!fs.existsSync(appsDir)) return []

  const entries = fs.readdirSync(appsDir, { withFileTypes: true })
  const apps: Array<{ manifest: AppManifest; dir: string }> = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_')) continue // Skip _template and other _ dirs

    const manifestPath = path.join(appsDir, entry.name, 'manifest.yaml')
    if (!fs.existsSync(manifestPath)) continue

    try {
      const manifest = parseManifest(manifestPath)
      apps.push({ manifest, dir: path.join(appsDir, entry.name) })
    } catch (err) {
      console.error(`Failed to parse manifest for app "${entry.name}":`, err)
    }
  }

  return apps
}

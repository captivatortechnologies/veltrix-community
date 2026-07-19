// ========================================================================
// App Registry
//
// Central registry that manages the lifecycle of all apps:
// discover -> install -> enable -> disable -> uninstall
//
// Loads pipeline handlers and makes them available to the pipeline engine.
// ========================================================================

import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import type { AppManifest } from '../../../../shared/types/app'
import type { PipelineHandlers } from '../pipeline-engine/types'
import { discoverManifests, parseManifest } from './manifest-parser'
import { AppMigrationRunner, appSchemaName, type AppIsolation } from './migration-runner'

interface LoadedApp {
  manifest: AppManifest
  dir: string
  pipelineHandlers: Map<string, PipelineHandlers> // configTypeId -> handlers
  serverModule: any // The loaded server/index.ts module
}

export class AppRegistry {
  private loadedApps = new Map<string, LoadedApp>()
  private migrationRunner: AppMigrationRunner

  constructor(
    private db: PrismaClient,
    private appsDir: string,
  ) {
    this.migrationRunner = new AppMigrationRunner(db)
  }

  // ------------------------------------------------------------------
  // DISCOVER: Scan apps directory for available apps
  // ------------------------------------------------------------------
  async discover(): Promise<AppManifest[]> {
    const discovered = discoverManifests(this.appsDir)
    return discovered.map((d) => d.manifest)
  }

  // ------------------------------------------------------------------
  // INSTALL: Register an app in the database and load its code
  // ------------------------------------------------------------------
  async install(
    appId: string,
    source: 'BUILT_IN' | 'MARKETPLACE' | 'CUSTOM' = 'BUILT_IN',
  ): Promise<void> {
    const manifestPath = path.join(this.appsDir, appId, 'manifest.yaml')
    const manifest = parseManifest(manifestPath)
    const appDir = path.join(this.appsDir, appId)

    const isBuiltIn = source === 'BUILT_IN'

    // Upsert the App record
    const appRecord = await this.db.app.upsert({
      where: { appId: manifest.id },
      create: {
        appId: manifest.id,
        name: manifest.name,
        version: manifest.version,
        vendor: manifest.vendor,
        description: manifest.description,
        category: manifest.category,
        icon: manifest.icon,
        logo: manifest.logo,
        license: manifest.license,
        homepage: manifest.homepage,
        manifestPath,
        source,
        isDefault: isBuiltIn,
        status: 'AVAILABLE',
      },
      update: {
        name: manifest.name,
        version: manifest.version,
        vendor: manifest.vendor,
        description: manifest.description,
        category: manifest.category,
        icon: manifest.icon,
        logo: manifest.logo,
      },
    })

    const dbAppId = appRecord.id // Use the database UUID, not the slug

    // Upsert a legacy Tool that represents this app, so components/credentials
    // created for the app resolve to a real toolId (see ensureAppTool). Guarded
    // so a Tool failure never blocks app install.
    await this.ensureAppTool(manifest)

    // Register permission definitions
    for (const perm of manifest.permissions.app) {
      for (const action of perm.actions) {
        await this.db.appPermissionDefinition.upsert({
          where: {
            appId_resource_action: {
              appId: dbAppId,
              resource: perm.resource,
              action,
            },
          },
          create: {
            appId: dbAppId,
            resource: perm.resource,
            action,
            description: perm.description,
          },
          update: { description: perm.description },
        })
      }
    }

    // Register setting definitions
    for (const setting of manifest.settings || []) {
      await this.db.appSettingDefinition.upsert({
        where: { appId_key: { appId: dbAppId, key: setting.key } },
        create: {
          appId: dbAppId,
          key: setting.key,
          type: setting.type,
          label: setting.label,
          description: setting.description,
          defaultValue: setting.default?.toString(),
          required: setting.required || false,
          options: setting.options as any,
        },
        update: {
          type: setting.type,
          label: setting.label,
          description: setting.description,
          defaultValue: setting.default?.toString(),
          required: setting.required || false,
          options: setting.options as any,
        },
      })
    }

    // Register configuration types
    for (const ct of manifest.pipeline.configurationTypes) {
      await this.db.appConfigurationType.upsert({
        where: { appId_configTypeId: { appId: dbAppId, configTypeId: ct.id } },
        create: {
          appId: dbAppId,
          configTypeId: ct.id,
          name: ct.name,
          description: ct.description,
          templatePath: ct.canvasTemplate,
          defaultPath: ct.defaultConfig,
          componentTypes: ct.targets.componentTypes,
          requiresCred: ct.targets.requiresCredential,
          requiresConnect: ct.targets.requiresConnectivity,
        },
        update: {
          name: ct.name,
          description: ct.description,
          templatePath: ct.canvasTemplate,
          componentTypes: ct.targets.componentTypes,
        },
      })
    }

    // Run database migrations if defined
    if (manifest.database?.migrations) {
      const migrationsDir = path.resolve(appDir, manifest.database.migrations)

      // Trusted first-party (BUILT_IN) apps may use their declared mode
      // (default shared). Marketplace / customer-authored (self-managed) apps
      // get at least schema isolation, but may opt UP to the stronger
      // per-database or bring-your-own-store (external) tiers.
      const requested = manifest.database.isolation
      const isolation: AppIsolation =
        source === 'BUILT_IN'
          ? requested ?? 'shared'
          : requested === 'schema' || requested === 'database' || requested === 'external'
            ? requested
            : 'schema'

      try {
        const applied = await this.migrationRunner.runMigrations(manifest.id, migrationsDir, {
          tablePrefix: manifest.database.tablePrefix,
          isolation,
          schema: isolation === 'schema' ? appSchemaName(manifest.id) : undefined,
        })
        if (applied.length > 0) {
          console.log(`[AppRegistry] Applied ${applied.length} migration(s) for ${manifest.id}`)
        }
      } catch (err) {
        console.error(`[AppRegistry] Migration failed for ${manifest.id}:`, err)
        throw err
      }
    }

    // Run install hook if defined
    if (manifest.hooks?.onInstall) {
      const hookPath = path.resolve(appDir, manifest.hooks.onInstall)
      try {
        const hookModule = require(hookPath)
        const hook = hookModule.default || hookModule
        await hook({ db: this.db, appId: manifest.id })
      } catch (err) {
        console.error(`Install hook failed for app "${manifest.id}":`, err)
      }
    }

    // Load the app into memory
    await this.loadApp(manifest, appDir)
  }

  // ------------------------------------------------------------------
  // TOOL LINK: Represent each app as a legacy Tool catalog row
  //
  // Components/Credentials are keyed to a Tool (toolId), not to an appId. To
  // let users register an app's target component + credential in-context, we
  // upsert a Tool named after the app on install. This is purely additive and
  // never participates in the deploy path or component/credential resolution.
  // ------------------------------------------------------------------

  /**
   * Upsert the Tool that represents an app (keyed by the unique Tool.name ===
   * manifest.name). Returns the tool id, or null if the upsert failed — a Tool
   * failure must never block app install.
   */
  private async ensureAppTool(manifest: AppManifest): Promise<string | null> {
    try {
      const tool = await this.db.tool.upsert({
        where: { name: manifest.name },
        update: {
          description: manifest.description ?? manifest.name,
          vendor: manifest.vendor ?? 'Veltrix',
          category: manifest.category ?? 'CUSTOM',
          isActive: true,
        },
        create: {
          name: manifest.name,
          description: manifest.description ?? manifest.name,
          vendor: manifest.vendor ?? 'Veltrix',
          category: manifest.category ?? 'CUSTOM',
          logoUrl: null,
        },
      })
      return tool.id
    } catch (err) {
      console.error(`[AppRegistry] Failed to upsert Tool for app "${manifest.id}":`, err)
      return null
    }
  }

  /**
   * Ensure a CustomerTool link exists for a tool + customer (idempotent upsert
   * on the CustomerTool composite key). Guarded — never blocks enable.
   */
  private async ensureCustomerToolLink(toolId: string, customerId: string): Promise<void> {
    try {
      await this.db.customerTool.upsert({
        where: { customerId_toolId: { customerId, toolId } },
        update: {},
        create: { customerId, toolId },
      })
    } catch (err) {
      console.error(
        `[AppRegistry] Failed to upsert CustomerTool (tool=${toolId}, customer=${customerId}):`,
        err,
      )
    }
  }

  // ------------------------------------------------------------------
  // ENABLE: Enable an app for a specific customer
  // ------------------------------------------------------------------
  async enable(appId: string, customerId: string, userId: string): Promise<void> {
    const app = await this.db.app.findUniqueOrThrow({ where: { appId } })

    await this.db.appInstallation.upsert({
      where: { appId_customerId: { appId: app.id, customerId } },
      create: {
        appId: app.id,
        customerId,
        version: app.version,
        enabled: true,
        installedBy: userId,
        status: 'ENABLED',
      },
      update: {
        enabled: true,
        status: 'ENABLED',
      },
    })

    // Ensure a CustomerTool link exists for this app's Tool + customer, so the
    // in-context "Add connection" flow can create components/credentials against
    // a tool the customer owns. Guarded — never blocks enable.
    try {
      const tool = await this.db.tool.findUnique({ where: { name: app.name } })
      if (tool) {
        await this.ensureCustomerToolLink(tool.id, customerId)
      }
    } catch (err) {
      console.error(`[AppRegistry] Failed to link CustomerTool for app "${appId}":`, err)
    }

    // Run onEnable hook if defined
    const loaded = this.loadedApps.get(appId)
    if (loaded?.manifest.hooks?.onEnable) {
      try {
        const hookPath = path.resolve(loaded.dir, loaded.manifest.hooks.onEnable)
        const hookModule = require(hookPath)
        const hook = hookModule.default || hookModule
        await hook({ db: this.db, appId, customerId })
      } catch (err) {
        console.error(`[AppRegistry] onEnable hook failed for "${appId}":`, err)
      }
    }
  }

  // ------------------------------------------------------------------
  // DISABLE: Disable an app for a customer (data preserved)
  // ------------------------------------------------------------------
  async disable(appId: string, customerId: string): Promise<void> {
    const app = await this.db.app.findUniqueOrThrow({ where: { appId } })

    // Run onDisable hook if defined
    const loaded = this.loadedApps.get(appId)
    if (loaded?.manifest.hooks?.onDisable) {
      try {
        const hookPath = path.resolve(loaded.dir, loaded.manifest.hooks.onDisable)
        const hookModule = require(hookPath)
        const hook = hookModule.default || hookModule
        await hook({ db: this.db, appId, customerId })
      } catch (err) {
        console.error(`[AppRegistry] onDisable hook failed for "${appId}":`, err)
      }
    }

    await this.db.appInstallation.update({
      where: { appId_customerId: { appId: app.id, customerId } },
      data: { enabled: false, status: 'DISABLED' },
    })
  }

  // ------------------------------------------------------------------
  // UNINSTALL: Remove an app (run cleanup hook)
  // ------------------------------------------------------------------
  async uninstall(appId: string): Promise<void> {
    const loaded = this.loadedApps.get(appId)

    if (loaded?.manifest.hooks?.onUninstall) {
      const hookPath = path.resolve(loaded.dir, loaded.manifest.hooks.onUninstall)
      try {
        const hookModule = require(hookPath)
        const hook = hookModule.default || hookModule
        await hook({ db: this.db, appId })
      } catch (err) {
        console.error(`Uninstall hook failed for app "${appId}":`, err)
      }
    }

    // Remove from database
    const app = await this.db.app.findUnique({ where: { appId } })
    if (app) {
      await this.db.appInstallation.deleteMany({ where: { appId: app.id } })
      await this.db.appPermissionDefinition.deleteMany({ where: { appId: app.id } })
      await this.db.appSettingDefinition.deleteMany({ where: { appId: app.id } })
      await this.db.appConfigurationType.deleteMany({ where: { appId: app.id } })
      await this.db.app.delete({ where: { id: app.id } })
    }

    this.loadedApps.delete(appId)
  }

  // ------------------------------------------------------------------
  // LOAD: Load app code and pipeline handlers into memory
  // ------------------------------------------------------------------
  private async loadApp(manifest: AppManifest, appDir: string): Promise<void> {
    const handlers = new Map<string, PipelineHandlers>()

    for (const ct of manifest.pipeline.configurationTypes) {
      try {
        const resolve = (p: string) => path.resolve(appDir, p)

        const validateMod = require(resolve(ct.handlers.validate))
        const deployMod = require(resolve(ct.handlers.deploy))
        const rollbackMod = require(resolve(ct.handlers.rollback))
        const healthCheckMod = require(resolve(ct.handlers.healthCheck))
        const getStatusMod = require(resolve(ct.handlers.getStatus))

        let driftDetectFn = undefined
        if (ct.handlers.driftDetect) {
          const driftMod = require(resolve(ct.handlers.driftDetect))
          driftDetectFn = driftMod.default || driftMod
        }

        handlers.set(ct.id, {
          validate: validateMod.default || validateMod,
          deploy: deployMod.default || deployMod,
          rollback: rollbackMod.default || rollbackMod,
          healthCheck: healthCheckMod.default || healthCheckMod,
          driftDetect: driftDetectFn,
          getStatus: getStatusMod.default || getStatusMod,
        })
      } catch (err) {
        console.error(`Failed to load pipeline handlers for ${manifest.id}/${ct.id}:`, err)
      }
    }

    // Load server entry module
    let serverModule: any = null
    try {
      const entryPath = path.resolve(appDir, manifest.server.entry)
      serverModule = require(entryPath)
    } catch (err) {
      console.error(`Failed to load server entry for ${manifest.id}:`, err)
    }

    this.loadedApps.set(manifest.id, {
      manifest,
      dir: appDir,
      pipelineHandlers: handlers,
      serverModule,
    })
  }

  // ------------------------------------------------------------------
  // QUERY: Get loaded apps and handlers
  // ------------------------------------------------------------------

  getLoadedApp(appId: string): LoadedApp | undefined {
    return this.loadedApps.get(appId)
  }

  getAllLoadedApps(): LoadedApp[] {
    return Array.from(this.loadedApps.values())
  }

  /**
   * Dispatch an inbound webhook to every loaded app that declares an `onWebhook`
   * hook. Each app decides whether the (source, event) is relevant and updates
   * its OWN data — the platform stays ignorant of any app's provisioning
   * semantics. A failing app handler is logged and never breaks webhook ingest.
   */
  async dispatchWebhook(notification: { source: string; event: string; payload: any }): Promise<void> {
    for (const app of this.loadedApps.values()) {
      const hookRef = app.manifest.hooks?.onWebhook
      if (!hookRef) continue
      try {
        const mod = require(path.resolve(app.dir, hookRef))
        const handler = mod.default || mod
        await handler({
          db: this.db,
          appId: app.manifest.id,
          source: notification.source,
          event: notification.event,
          payload: notification.payload,
        })
      } catch (err) {
        console.error(`[AppRegistry] onWebhook failed for "${app.manifest.id}":`, err)
      }
    }
  }

  /**
   * Dispatch a platform message-bus event to every loaded app that declares an
   * `onEvent` hook. Symmetric with dispatchWebhook; the platform stays ignorant
   * of the event's meaning. A failing app handler is logged, never rethrown.
   */
  async dispatchEvent(event: { topic: string; payload: any }): Promise<void> {
    for (const app of this.loadedApps.values()) {
      const hookRef = app.manifest.hooks?.onEvent
      if (!hookRef) continue
      try {
        const mod = require(path.resolve(app.dir, hookRef))
        const handler = mod.default || mod
        await handler({
          db: this.db,
          appId: app.manifest.id,
          topic: event.topic,
          payload: event.payload,
        })
      } catch (err) {
        console.error(`[AppRegistry] onEvent failed for "${app.manifest.id}":`, err)
      }
    }
  }

  /**
   * Run a loaded app's connection-test handler in-process (with the decrypted
   * credential in `context.credential`). Returns the handler's result, or `null`
   * when the app declares no `connectivity.testHandler`. Only rethrows if the
   * handler itself throws.
   */
  async testConnection(appId: string, context: any): Promise<any | null> {
    const app = this.loadedApps.get(appId)
    if (!app) throw new Error(`App "${appId}" is not loaded`)
    const ref = app.manifest.connectivity?.testHandler
    if (!ref) return null
    const mod = require(path.resolve(app.dir, ref))
    const handler = mod.default || mod
    return handler(context)
  }

  /**
   * Run a loaded app's optional onboarding finalize hook in-process, after the
   * platform has persisted a newly-onboarded connection. Returns the handler's
   * result, or `null` when the app declares no `connection.onboarding.onboardingHandler`.
   * Mirrors `testConnection`: a manifest path resolved + invoked in-process.
   */
  async runOnboardingHandler(appId: string, context: any): Promise<any | null> {
    const app = this.loadedApps.get(appId)
    if (!app) throw new Error(`App "${appId}" is not loaded`)
    const ref = app.manifest.connection?.onboarding?.onboardingHandler
    if (!ref) return null
    const mod = require(path.resolve(app.dir, ref))
    const handler = mod.default || mod
    return handler(context)
  }

  /**
   * Run a loaded app's declared operation handler in-process (with the decrypted
   * credential in `context.credential`). Returns the handler's result, or `null`
   * when the app declares no operation with that id. Only rethrows if the handler
   * itself throws. Mirrors `testConnection` — an operation is a one-off action
   * (restart, export, retry) rather than a declarative config deploy.
   */
  async runOperation(appId: string, operationId: string, context: any): Promise<any | null> {
    const app = this.loadedApps.get(appId)
    if (!app) throw new Error(`App "${appId}" is not loaded`)
    const op = app.manifest.operations?.find((o) => o.id === operationId)
    if (!op) return null
    const mod = require(path.resolve(app.dir, op.handler))
    const handler = mod.default || mod
    return handler(context)
  }

  /**
   * Run a loaded app's optional per-tenant upgrade hook in-process, after the
   * platform has bumped a tenant's installed version. Returns true when a hook
   * ran, false when the app declares no `hooks.onUpgrade`. Best-effort by
   * design — a failing hook is logged and swallowed so it never blocks the
   * upgrade (the version bump is the source of truth). Mirrors the shape of the
   * onEnable/onDisable hook invocations.
   */
  async runUpgradeHook(
    appId: string,
    ctx: { customerId: string; fromVersion: string; toVersion: string },
  ): Promise<boolean> {
    const loaded = this.loadedApps.get(appId)
    const ref = loaded?.manifest.hooks?.onUpgrade
    if (!loaded || !ref) return false
    try {
      const hookModule = require(path.resolve(loaded.dir, ref))
      const hook = hookModule.default || hookModule
      await hook({
        db: this.db,
        appId,
        customerId: ctx.customerId,
        fromVersion: ctx.fromVersion,
        toVersion: ctx.toVersion,
      })
      return true
    } catch (err) {
      console.error(`[AppRegistry] onUpgrade hook failed for "${appId}":`, err)
      return false
    }
  }

  /**
   * Get the apps directory path.
   */
  getAppsDir(): string {
    return this.appsDir
  }

  /**
   * Get pipeline handlers for an app's configuration type.
   * Used by the pipeline engine to call app handlers.
   */
  getPipelineHandlers(appId: string, configTypeId: string): PipelineHandlers | null {
    const app = this.loadedApps.get(appId)
    if (!app) return null
    return app.pipelineHandlers.get(configTypeId) || null
  }

  /**
   * Get enabled apps for a customer. `installedVersion` is THIS tenant's
   * AppInstallation.version (per-tenant), which can lag the registered on-disk
   * `manifest.version` — the app header shows the tenant's installed version so
   * it stays consistent with the per-tenant upgrade banner.
   */
  async getEnabledApps(
    customerId: string,
  ): Promise<Array<{ appId: string; manifest: AppManifest; installedVersion: string }>> {
    const installations = await this.db.appInstallation.findMany({
      where: { customerId, enabled: true, status: 'ENABLED' },
      include: { app: true },
    })

    return installations
      .map((inst) => {
        const loaded = this.loadedApps.get(inst.app.appId)
        if (!loaded) return null
        return {
          appId: inst.app.appId,
          manifest: this.manifestForNav(inst.app.appId, loaded.manifest),
          installedVersion: inst.version,
        }
      })
      .filter(Boolean) as Array<{ appId: string; manifest: AppManifest; installedVersion: string }>
  }

  /**
   * Manifest used to build an app's client nav. In local app-development mode
   * (APPS_DIR points at a repo checkout of the community apps), re-parse the
   * manifest from disk on each request so edits — new pages, nav groups — show
   * up without a server restart. Otherwise, and on any parse error, use the
   * manifest cached at load time. Never throws.
   */
  private manifestForNav(appId: string, cached: AppManifest): AppManifest {
    if (!process.env.APPS_DIR) return cached
    try {
      return parseManifest(path.join(this.appsDir, appId, 'manifest.yaml'))
    } catch {
      return cached
    }
  }

  /**
   * Initialize: discover and install all built-in apps on startup.
   */
  async initialize(): Promise<void> {
    const discovered = discoverManifests(this.appsDir)

    for (const { manifest, dir } of discovered) {
      try {
        await this.install(manifest.id)
        console.log(`[AppRegistry] Loaded app: ${manifest.name} v${manifest.version}`)
      } catch (err) {
        console.error(`[AppRegistry] Failed to load app "${manifest.id}":`, err)
      }
    }

    console.log(`[AppRegistry] ${this.loadedApps.size} app(s) loaded`)
  }
}

// ========================================================================
// App Management Routes
//
// Endpoints for listing, enabling, and disabling apps for a customer.
// Used by the app management UI and the client-side app loader.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../../db'
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware'
import { checkTenantQuota } from '../../middlewares/tenant-ownership.middleware'
import { loggerService } from '../../module/logger/logger.service'
import { getAppRegistry } from '../platform-bootstrap'
import { validatePackageBuffer, extractPackage, MAX_PACKAGE_SIZE } from './app-packager'
import { marketplaceCatalog } from './marketplace-catalog'
import { validateDownloadUrl } from './url-validator'
import { downloadAppPackage } from './app-downloader'
import { registerAppClientBundleRoute } from './app-client-bundle.route'
import { registerAppConfigTemplateRoutes } from './app-config-template.route'
import { registerAppBrandingRoutes, buildEnabledBranding } from './app-branding.route'
import { vetApp, type VetResult } from './app-vetting.service'
import { buildAppVersionInfo, compareVersions } from './app-version'
import { recordAuditEvent } from '../../lib/audit-event'
import { resolvePermissionSnapshotForUser, snapshotGrants } from '../../lib/permissions'
import { decryptCredentialSecrets } from '../../module/credential/credential.service'
import type { AppPageDeclaration } from '../../../../shared/types/app'

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
}

// APAV-style vetting report shapes (see app-vetting.service.ts).
// 422 body when a package is rejected at install time:
const vettingRejectedSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    appId: { type: 'string' },
    errors: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}
// Additive `vetting` property on successful install responses:
const vettingApprovedSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * R3 (RBAC/IdP hardening, 2026-07-10): server-side enforcement of
 * AppPageDeclaration.requiresPermission — a page a user cannot access is not
 * even advertised in the nav/page list the client renders from. Pages
 * without a `requiresPermission` declaration are always included (the
 * manifest author opted them out of gating, e.g. an app's landing page).
 */
export function filterPagesByPermission(
  pages: AppPageDeclaration[],
  appId: string,
  snapshot: Awaited<ReturnType<typeof resolvePermissionSnapshotForUser>>,
): AppPageDeclaration[] {
  return pages.filter((page) => {
    if (!page.requiresPermission) return true
    const { resource, action } = page.requiresPermission
    return snapshotGrants(snapshot, resource, action, { appId })
  })
}

/** Structured log line for every vetting run (one per install attempt). */
function logVettingResult(appId: string, vetting: VetResult): void {
  const status = vetting.errors.length > 0 ? 'REJECTED' : 'APPROVED'
  loggerService.info(
    `App vetting ${status} for "${appId}": ${vetting.errors.length} error(s), ${vetting.warnings.length} warning(s)`,
    { appId, status, errorCount: vetting.errors.length, warningCount: vetting.warnings.length },
  )
}

export async function appManagementRoutes(fastify: FastifyInstance) {
  // GET /:appId/client.mjs — the app's client page bundle (browser ESM).
  // Registered here so it shares the /api/apps prefix; see the module for
  // why it is deliberately unauthenticated and schema-less.
  registerAppClientBundleRoute(fastify)

  // GET /:appId/config-types/:configTypeId/canvas|defaults — the app's
  // Configuration Canvas template + defaults, parsed to JSON for the generic
  // client authoring surface. Same /api/apps prefix; see the module for why
  // these ARE bearer-authenticated (unlike client.mjs) and schema-less.
  registerAppConfigTemplateRoutes(fastify)

  // GET /:appId/branding/logo(-dark) — the app's navbar logo. Same prefix,
  // same deliberate lack of auth (img tags cannot send Bearer headers);
  // see the module for the manifest-scoped path safety rules.
  registerAppBrandingRoutes(fastify)

  // List all available apps with installation status for the customer
  // @ts-ignore
  fastify.get('/', {
    preHandler: [verifyToken],
    schema: {
      tags: ['apps'],
      summary: 'List apps',
      description: 'Returns all available apps with their installation status for the customer',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              appId: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'string' },
              vendor: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              icon: { type: 'string' },
              logo: { type: 'string' },
              source: { type: 'string' },
              isDefault: { type: 'boolean' },
              status: { type: 'string' },
              installed: { type: 'boolean' },
              enabled: { type: 'boolean' },
              // Brand identity slots — same shape as /enabled. logo URLs are
              // present only when the manifest declares a logo whose file exists.
              branding: {
                type: 'object',
                properties: {
                  primaryColor: { type: 'string' },
                  accentColor: { type: 'string' },
                  logoUrl: { type: 'string' },
                  logoDarkUrl: { type: 'string' },
                },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const apps = await prisma.app.findMany({
          orderBy: { name: 'asc' },
          include: {
            installations: {
              where: { customerId },
              take: 1,
            },
          },
        })

        const registry = getAppRegistry()
        const result = apps.map((app) => {
          const installation = app.installations[0]
          // Branding (colors + logo URLs) comes from the loaded manifest, not the
          // DB row — matches the /enabled endpoint so app cards can show the logo.
          const loaded = registry.getLoadedApp(app.appId)
          const branding = loaded
            ? buildEnabledBranding(app.appId, loaded.dir, loaded.manifest.branding)
            : undefined
          return {
            id: app.id,
            appId: app.appId,
            name: app.name,
            version: app.version,
            vendor: app.vendor,
            description: app.description,
            category: app.category,
            icon: app.icon,
            logo: app.logo,
            source: app.source,
            isDefault: app.isDefault,
            status: app.status,
            installed: !!installation,
            enabled: installation?.enabled ?? false,
            branding,
          }
        })

        reply.send(result)
      } catch (error) {
        loggerService.error('Error listing apps:', error)
        reply.status(500).send({ error: 'Error listing apps' })
      }
    },
  })

  // Get enabled apps for the current customer (lightweight, for app loader)
  // @ts-ignore
  fastify.get('/enabled', {
    preHandler: [verifyToken],
    schema: {
      tags: ['apps'],
      summary: 'List enabled apps',
      description: 'Returns enabled apps with their client configuration for dynamic UI loading',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              appId: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'string' },
              homepage: { type: 'string' },
              icon: { type: 'string' },
              category: { type: 'string' },
              // Mirrors AppPageDeclaration (shared/types/app.ts). Every field
              // must be listed here or Fastify's response serialization strips
              // it — `component` in particular is required by the generic
              // client-side app page loader (AppPageHost).
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    component: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                    icon: { type: 'string' },
                    sidebar: { type: 'boolean' },
                    nav: { type: 'string' },
                    parent: { type: 'string' },
                    group: { type: 'string' },
                    order: { type: 'number' },
                    layout: { type: 'string' },
                    requiresPermission: {
                      type: 'object',
                      properties: {
                        resource: { type: 'string' },
                        action: { type: 'string' },
                      },
                    },
                  },
                },
              },
              configurationTypes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    // Optional sidebar sub-group label — must be listed or
                    // Fastify's response serialization strips it (same pitfall
                    // as `pages` above), and the client would render a flat list.
                    group: { type: 'string' },
                  },
                },
              },
              // Brand identity in defined slots (see app-branding.route.ts).
              // Colors are pre-validated hex; logo URLs are present only when
              // the manifest declares a logo whose file exists in the app dir.
              // Omitted entirely for apps without usable branding.
              branding: {
                type: 'object',
                properties: {
                  primaryColor: { type: 'string' },
                  accentColor: { type: 'string' },
                  logoUrl: { type: 'string' },
                  logoDarkUrl: { type: 'string' },
                },
              },
              // Per-app navigation layout for the app shell: 'tabs' (default
              // horizontal top nav) or 'sidebar' (embedded left rail, for apps
              // with many configuration types). Must be listed or Fastify's
              // response serialization strips it.
              navLayout: { type: 'string' },
              // One-click connection onboarding descriptor (see
              // connection.onboarding in the manifest). Present only when the
              // app declares it; drives the "Connect …" button + required-
              // settings dialog in the client Connections UI. Every field must
              // be listed or Fastify strips it from the response.
              connection: {
                type: 'object',
                properties: {
                  onboarding: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string' },
                      label: { type: 'string' },
                      brokered: { type: 'boolean' },
                      requiredSettings: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        401: errorSchema,
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = request.user?.customerId
        const userId = request.user?.id
        if (!customerId || !userId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const registry = getAppRegistry()
        const enabledApps = await registry.getEnabledApps(customerId)

        // Resolved once per request — R3: pages declaring requiresPermission
        // are filtered out for a user who doesn't hold that app-scoped
        // permission, so the nav/page list the client renders from never
        // advertises a page the user can't use.
        const snapshot = await resolvePermissionSnapshotForUser(userId)

        const result = enabledApps.map(({ appId, manifest, installedVersion }) => {
          const appDir =
            registry.getLoadedApp(appId)?.dir ?? path.join(registry.getAppsDir(), appId)
          return {
            appId,
            name: manifest.name,
            // The tenant's installed version (per-tenant), not the on-disk
            // manifest version — keeps the app header in step with the upgrade
            // banner. Falls back to the manifest version defensively.
            version: installedVersion ?? manifest.version,
            homepage: manifest.homepage,
            icon: manifest.icon,
            category: manifest.category,
            pages: filterPagesByPermission(manifest.client?.pages || [], appId, snapshot),
            configurationTypes: manifest.pipeline.configurationTypes.map((ct) => ({
              id: ct.id,
              name: ct.name,
              group: ct.group,
            })),
            branding: buildEnabledBranding(appId, appDir, manifest.branding),
            // Per-app nav layout. `client.navLayout` is added to the manifest
            // SDK type by a parallel workstream; read defensively so this route
            // compiles regardless of landing order. Normalized to the contract
            // ('sidebar' when explicitly declared, 'tabs' otherwise).
            navLayout:
              (manifest.client as { navLayout?: string } | undefined)?.navLayout === 'sidebar'
                ? 'sidebar'
                : 'tabs',
            // Onboarding descriptor (client-safe subset) — advertised so the
            // Connections UI can render a "Connect …" button + collect any
            // required settings before the consent click. Omitted when absent.
            connection: manifest.connection?.onboarding
              ? {
                  onboarding: {
                    provider: manifest.connection.onboarding.provider,
                    label: manifest.connection.onboarding.label,
                    brokered: manifest.connection.onboarding.params?.brokered ?? false,
                    requiredSettings: manifest.connection.onboarding.params?.requiredSettings ?? [],
                  },
                }
              : undefined,
          }
        })

        reply.send(result)
      } catch (error) {
        loggerService.error('Error listing enabled apps:', error)
        reply.status(500).send({ error: 'Error listing enabled apps' })
      }
    },
  })

  // Enable an app for the customer
  // checkTenantQuota('apps') is a no-op in the community edition — every app
  // feature ships free and ungated (see middlewares/tenant-ownership.middleware).
  // Kept as a preHandler so a hosted build can layer real tier limits back in
  // without touching this route.
  // @ts-ignore
  fastify.post('/:appId/enable', {
    preHandler: [verifyToken, hasPermission('apps', 'write'), checkTenantQuota('apps')],
    schema: {
      tags: ['apps'],
      summary: 'Enable app',
      description: 'Enables an app for the current customer',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        401: errorSchema,
        403: errorSchema,
        429: errorSchema,
        500: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        const userId = request.user?.id
        if (!customerId || !userId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const registry = getAppRegistry()
        await registry.enable(request.params.appId, customerId, userId)

        reply.send({ message: `App "${request.params.appId}" enabled` })
      } catch (error) {
        loggerService.error('Error enabling app:', error)
        reply.status(500).send({ error: 'Error enabling app' })
      }
    },
  })

  // Disable an app for the customer
  // @ts-ignore
  fastify.post('/:appId/disable', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Disable app',
      description: 'Disables an app for the current customer (data preserved)',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const registry = getAppRegistry()
        await registry.disable(request.params.appId, customerId)

        reply.send({ message: `App "${request.params.appId}" disabled` })
      } catch (error) {
        loggerService.error('Error disabling app:', error)
        reply.status(500).send({ error: 'Error disabling app' })
      }
    },
  })

  // Get app detail
  // @ts-ignore
  fastify.get('/:appId', {
    preHandler: [verifyToken],
    schema: {
      tags: ['apps'],
      summary: 'Get app details',
      description: 'Returns detailed information about a specific app',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appId: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            vendor: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            icon: { type: 'string' },
            logo: { type: 'string' },
            license: { type: 'string' },
            homepage: { type: 'string' },
            source: { type: 'string' },
            isDefault: { type: 'boolean' },
            status: { type: 'string' },
            installed: { type: 'boolean' },
            enabled: { type: 'boolean' },
            configurationTypes: { type: 'array' },
            permissions: { type: 'array' },
            settings: { type: 'array' },
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const app = await prisma.app.findUnique({
          where: { appId: request.params.appId },
          include: {
            installations: { where: { customerId }, take: 1 },
            configTypes: true,
            permissions: true,
            settings: true,
          },
        })

        if (!app) {
          return reply.status(404).send({ error: 'App not found' })
        }

        const installation = app.installations[0]

        reply.send({
          id: app.id,
          appId: app.appId,
          name: app.name,
          version: app.version,
          vendor: app.vendor,
          description: app.description,
          category: app.category,
          icon: app.icon,
          logo: app.logo,
          license: app.license,
          homepage: app.homepage,
          source: app.source,
          isDefault: app.isDefault,
          status: app.status,
          installed: !!installation,
          enabled: installation?.enabled ?? false,
          configurationTypes: app.configTypes.map((ct) => ({
            id: ct.configTypeId,
            name: ct.name,
            description: ct.description,
            componentTypes: ct.componentTypes,
          })),
          permissions: app.permissions.map((p) => ({
            resource: p.resource,
            action: p.action,
            description: p.description,
          })),
          settings: app.settings.map((s) => ({
            key: s.key,
            type: s.type,
            label: s.label,
            description: s.description,
            default: s.defaultValue,
            required: s.required,
            options: s.options,
          })),
        })
      } catch (error) {
        loggerService.error('Error fetching app detail:', error)
        reply.status(500).send({ error: 'Error fetching app detail' })
      }
    },
  })

  // ------------------------------------------------------------------
  // Marketplace catalog
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.get('/marketplace', {
    preHandler: [verifyToken],
    schema: {
      tags: ['apps'],
      summary: 'Browse marketplace',
      description: 'Returns the catalog of apps available for installation',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          category: { type: 'string' },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: { search?: string; category?: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { search, category } = request.query

        let entries = category
          ? marketplaceCatalog.getByCategory(category)
          : marketplaceCatalog.getAll()

        if (search) {
          const term = search.toLowerCase()
          entries = entries.filter((e) =>
            [e.name, e.vendor, e.description, e.category, ...(e.tags ?? [])]
              .join(' ')
              .toLowerCase()
              .includes(term),
          )
        }

        reply.send(entries)
      } catch (error) {
        loggerService.error('Error fetching marketplace:', error)
        reply.status(500).send({ error: 'Error fetching marketplace catalog' })
      }
    },
  })

  // ------------------------------------------------------------------
  // Per-tenant app version + upgrade
  //
  // `installedVersion` is THIS tenant's AppInstallation.version; `latestVersion`
  // is the newest of the registered on-disk version and the published catalog
  // version. Tenants can sit on different versions of the same app, so both
  // routes are tenant-scoped (customerId from the JWT) and permission-gated
  // exactly like the other app routes.
  //
  // Both use a light schema (no `response` schema) on purpose — matching the
  // operations/test routes above — so Fastify never strips the nullable
  // `installedVersion` or the optional `releaseNotes`/`releasedAt` fields.
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.get('/:appId/version', {
    preHandler: [verifyToken, hasPermission('apps', 'read')],
    schema: {
      tags: ['apps'],
      summary: 'Get app version status',
      description:
        "Returns this tenant's installed version, the latest available version, whether an upgrade is available, and the latest release notes.",
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const app = await prisma.app.findUnique({
          where: { appId: request.params.appId },
          include: { installations: { where: { customerId }, take: 1 } },
        })
        if (!app) {
          return reply.status(404).send({ error: 'App not found' })
        }

        const info = buildAppVersionInfo({
          appId: app.appId,
          appVersion: app.version,
          installedVersion: app.installations[0]?.version ?? null,
          catalogEntry: marketplaceCatalog.getById(app.appId),
        })

        reply.send(info)
      } catch (error) {
        loggerService.error('Error fetching app version:', error)
        reply.status(500).send({ error: 'Error fetching app version' })
      }
    },
  })

  // @ts-ignore
  fastify.post('/:appId/upgrade', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Upgrade app for this tenant',
      description:
        "Pulls the latest published app package if the on-disk copy is behind, then updates ONLY this tenant's installed version. Idempotent when already on the latest version.",
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { appId } = request.params
        const customerId = request.user?.customerId
        const userId = request.user?.id
        if (!customerId || !userId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const app = await prisma.app.findUnique({
          where: { appId },
          include: { installations: { where: { customerId }, take: 1 } },
        })
        if (!app) {
          return reply.status(404).send({ error: 'App not found' })
        }

        const installation = app.installations[0]
        if (!installation) {
          return reply
            .status(400)
            .send({ error: 'App is not installed for this customer. Enable it first.' })
        }

        const fromVersion = installation.version
        const catalogEntry = marketplaceCatalog.getById(appId)
        const info = buildAppVersionInfo({
          appId,
          appVersion: app.version,
          installedVersion: fromVersion,
          catalogEntry,
        })

        if (!info.upgradeAvailable) {
          return reply.send({
            upgraded: false,
            appId,
            fromVersion,
            toVersion: info.latestVersion,
            message: 'Already on the latest version',
          })
        }

        const registry = getAppRegistry()

        // Step 1 — make the target available on disk. Only pull for non-built-in
        // apps whose registered version is behind the catalog and that offer a
        // downloadable package. Built-in apps ship their code with the platform,
        // so their on-disk version is authoritative and never pulled from a URL.
        if (
          app.source !== 'BUILT_IN' &&
          catalogEntry?.downloadUrl &&
          compareVersions(app.version, info.latestVersion) < 0
        ) {
          try {
            const { buffer, filename } = await downloadAppPackage(catalogEntry.downloadUrl)
            await validatePackageBuffer(buffer, filename)
            const appDir = path.join(registry.getAppsDir(), appId)
            await extractPackage(buffer, filename, appDir)

            const vetting = await vetApp(appDir)
            logVettingResult(appId, vetting)
            if (vetting.errors.length > 0) {
              return reply.status(422).send({
                status: 'REJECTED',
                appId,
                errors: vetting.errors,
                warnings: vetting.warnings,
              })
            }

            // Re-register: refreshes App.version + reloads the app's code. This
            // updates the SHARED on-disk copy (single-copy runtime); the tenant
            // version bump below is what makes the upgrade per-tenant.
            await registry.install(appId, 'MARKETPLACE')
          } catch (dlError) {
            const msg = dlError instanceof Error ? dlError.message : 'Download failed'
            return reply
              .status(502)
              .send({ error: `Failed to pull app "${appId}" from marketplace: ${msg}` })
          }
        }

        // Effective target is whatever version is actually available on disk now
        // (after any pull). Never mark a tenant onto a version whose code the
        // platform can't load — if nothing newer is installable yet, no-op.
        const refreshed = await prisma.app.findUnique({
          where: { appId },
          select: { version: true, name: true, id: true },
        })
        const effectiveTarget = refreshed?.version ?? app.version
        if (compareVersions(fromVersion, effectiveTarget) >= 0) {
          return reply.send({
            upgraded: false,
            appId,
            fromVersion,
            toVersion: effectiveTarget,
            message: 'No newer version is available to install yet.',
          })
        }

        // Step 2 — bump ONLY this tenant's installed version.
        await prisma.appInstallation.update({
          where: { id: installation.id },
          data: { version: effectiveTarget, status: 'ENABLED' },
        })

        // Step 3 — per-tenant upgrade hook (best-effort; never blocks).
        await registry.runUpgradeHook(appId, {
          customerId,
          fromVersion,
          toVersion: effectiveTarget,
        })

        // Step 4 — tenant audit trail.
        await recordAuditEvent({
          customerId,
          userId,
          action: 'update',
          resourceType: 'app',
          resourceId: refreshed?.id ?? app.id,
          resourceName: refreshed?.name ?? app.name,
          details: { event: 'upgrade', appId, fromVersion, toVersion: effectiveTarget },
        })

        loggerService.info(
          `App "${appId}" upgraded for customer ${customerId}: ${fromVersion} -> ${effectiveTarget}`,
        )

        return reply.send({
          upgraded: true,
          appId,
          fromVersion,
          toVersion: effectiveTarget,
        })
      } catch (error) {
        loggerService.error('Error upgrading app:', error)
        const msg = error instanceof Error ? error.message : 'Error upgrading app'
        reply.status(500).send({ error: msg })
      }
    },
  })

  // ------------------------------------------------------------------
  // Test a Connection's endpoint + credential
  //
  // Decrypts the connection's credential and runs the app's own
  // `connectivity.testHandler` in-process (never returns the secret) so the
  // user can verify the endpoint + credentials actually work. Apps without a
  // test handler report "not supported".
  // ------------------------------------------------------------------
  fastify.post('/:appId/connections/:credentialId/test', {
    preHandler: [verifyToken, hasPermission('apps', 'read')],
    handler: async (
      request: FastifyRequest<{ Params: { appId: string; credentialId: string } }>,
      reply: FastifyReply,
    ) => {
      const { appId, credentialId } = request.params
      const customerId = request.user?.customerId
      if (!customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const registry = getAppRegistry();
      if (!registry.getLoadedApp(appId)) {
        return reply.status(404).send({ error: `App "${appId}" is not installed` })
      }

      // Scope the credential to the caller's tenant.
      const raw = await prisma.credential.findFirst({ where: { id: credentialId, customerId } })
      if (!raw) {
        return reply.status(404).send({ error: 'Connection not found' })
      }

      const credential = decryptCredentialSecrets(raw)
      const installation = await prisma.appInstallation.findFirst({
        where: { app: { appId }, customerId, enabled: true },
      })

      const settings = (installation?.settings as Record<string, unknown>) ?? {}

      const context = {
        appId,
        customerId,
        endpoint: raw.endpoint ?? null,
        credential: {
          id: credential.id,
          name: credential.name,
          username: credential.username,
          password: credential.password,
          apiToken: credential.apiToken ?? null,
          certificate: (credential as { certificate?: string | null }).certificate ?? null,
        },
        component: null,
        connectivity: null,
        connectivityProvider: null,
        settings,
        // No token broker in the community edition — only the BYO-secret
        // connection path ships here, and BYO-secret handlers self-mint their
        // own tokens and never read ctx.identity. A brokered (consent-
        // onboarded) connection flow is an optional extension an operator can
        // wire up separately (see PipelineContext.identity in
        // pipeline-engine/types.ts); this stays undefined until one is.
        identity: undefined,
      }

      try {
        const result = await registry.testConnection(appId, context)
        if (result === null) {
          return reply.send({ ok: false, message: 'Connection testing is not supported by this app.' })
        }
        return reply.send(result)
      } catch (err) {
        loggerService.error(`[test-connection] ${appId}/${credentialId} failed:`, err)
        return reply.send({
          ok: false,
          message: err instanceof Error ? err.message : 'Connection test failed.',
        })
      }
    },
  })

  // ------------------------------------------------------------------
  // Run an app operation (restart, export, retry, …)
  //
  // Operations are one-off actions (not configuration deploys) declared under
  // the manifest `operations` list. The chosen connection's credential is
  // decrypted and the app's operation handler runs in-process (the secret is
  // never returned). Apps without a matching operation report "not supported".
  // ------------------------------------------------------------------
  fastify.post('/:appId/operations/:operationId', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    handler: async (
      request: FastifyRequest<{
        Params: { appId: string; operationId: string }
        Body: { credentialId?: string; params?: Record<string, unknown> }
      }>,
      reply: FastifyReply,
    ) => {
      const { appId, operationId } = request.params
      const customerId = request.user?.customerId
      if (!customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const registry = getAppRegistry();
      if (!registry.getLoadedApp(appId)) {
        return reply.status(404).send({ error: `App "${appId}" is not installed` })
      }

      const { credentialId, params } = request.body ?? {}

      // Decrypt the chosen connection's credential (scoped to the caller's tenant).
      let credential: unknown = null
      let endpoint: string | null = null
      if (credentialId) {
        const raw = await prisma.credential.findFirst({ where: { id: credentialId, customerId } })
        if (!raw) {
          return reply.status(404).send({ error: 'Connection not found' })
        }
        const dec = decryptCredentialSecrets(raw)
        endpoint = raw.endpoint ?? null
        credential = {
          id: dec.id,
          name: dec.name,
          username: dec.username,
          password: dec.password,
          apiToken: dec.apiToken ?? null,
          certificate: (dec as { certificate?: string | null }).certificate ?? null,
        }
      }

      const installation = await prisma.appInstallation.findFirst({
        where: { app: { appId }, customerId, enabled: true },
      })

      const context = {
        appId,
        customerId,
        operationId,
        endpoint,
        credential,
        component: endpoint ? { hostname: endpoint } : null,
        params: params ?? {},
        settings: (installation?.settings as Record<string, unknown>) ?? {},
      }

      try {
        const result = await registry.runOperation(appId, operationId, context)
        if (result === null) {
          return reply.send({ ok: false, message: `Operation "${operationId}" is not supported by this app.` })
        }
        return reply.send(result)
      } catch (err) {
        loggerService.error(`[operation] ${appId}/${operationId} failed:`, err)
        return reply.send({
          ok: false,
          message: err instanceof Error ? err.message : 'Operation failed.',
        })
      }
    },
  })

  // ------------------------------------------------------------------
  // Install a marketplace app
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.post('/:appId/install', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Install app',
      description: 'Installs an app from the marketplace or built-in catalog',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            appId: { type: 'string' },
            vetting: vettingApprovedSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        409: errorSchema,
        422: vettingRejectedSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { appId } = request.params

        // Check if already installed
        const existing = await prisma.app.findUnique({ where: { appId } })
        if (existing) {
          return reply.status(409).send({ error: `App "${appId}" is already installed` })
        }

        const registry = getAppRegistry()
        const appDir = path.join(registry.getAppsDir(), appId)

        // Tracks whether THIS request extracted the package, so rejection
        // cleanup never deletes a pre-existing (e.g. built-in) directory.
        let freshlyExtracted = false

        // Check if it exists on disk already (built-in or previously uploaded)
        if (!fs.existsSync(path.join(appDir, 'manifest.yaml'))) {
          // Try to auto-download from marketplace catalog if a downloadUrl is available
          const catalogEntry = marketplaceCatalog.getById(appId)
          if (catalogEntry?.downloadUrl) {
            try {
              const { buffer, filename } = await downloadAppPackage(catalogEntry.downloadUrl)
              await validatePackageBuffer(buffer, filename)
              await extractPackage(buffer, filename, appDir)
              freshlyExtracted = true
            } catch (dlError) {
              const msg = dlError instanceof Error ? dlError.message : 'Download failed'
              return reply.status(502).send({
                error: `Failed to download app "${appId}" from marketplace: ${msg}`,
              })
            }
          } else {
            return reply.status(404).send({
              error: `App "${appId}" not found. Upload a package or check the marketplace.`,
            })
          }
        }

        // APAV-style vetting: the platform validates the package itself and
        // refuses to install anything with errors.
        const vetting = await vetApp(appDir)
        logVettingResult(appId, vetting)
        if (vetting.errors.length > 0) {
          if (freshlyExtracted && fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true })
          }
          return reply.status(422).send({
            status: 'REJECTED',
            appId,
            errors: vetting.errors,
            warnings: vetting.warnings,
          })
        }

        await registry.install(appId, 'MARKETPLACE')

        reply.send({
          message: `App "${appId}" installed successfully`,
          appId,
          vetting: { status: 'APPROVED', warnings: vetting.warnings },
        })
      } catch (error) {
        loggerService.error('Error installing app:', error)
        const msg = error instanceof Error ? error.message : 'Error installing app'
        reply.status(500).send({ error: msg })
      }
    },
  })

  // ------------------------------------------------------------------
  // Uninstall an app
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.delete('/:appId', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Uninstall app',
      description: 'Uninstalls a custom or marketplace app. Built-in apps cannot be uninstalled.',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { appId } = request.params

        const app = await prisma.app.findUnique({ where: { appId } })
        if (!app) {
          return reply.status(404).send({ error: `App "${appId}" not found` })
        }

        if (app.source === 'BUILT_IN') {
          return reply.status(400).send({ error: 'Built-in apps cannot be uninstalled' })
        }

        const registry = getAppRegistry()
        await registry.uninstall(appId)

        // Remove custom app files from disk
        if (app.source === 'CUSTOM') {
          const appDir = path.join(registry.getAppsDir(), appId)
          if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true })
          }
        }

        reply.send({ message: `App "${appId}" uninstalled successfully` })
      } catch (error) {
        loggerService.error('Error uninstalling app:', error)
        const msg = error instanceof Error ? error.message : 'Error uninstalling app'
        reply.status(500).send({ error: msg })
      }
    },
  })

  // ------------------------------------------------------------------
  // Upload a custom app package (.zip or .tar/.tar.gz)
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.post('/upload', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Upload custom app',
      description: 'Upload a packaged app (.zip or .tar.gz). The package must contain a valid manifest.yaml.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            appId: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            vetting: vettingApprovedSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
        422: vettingRejectedSchema,
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const file = await request.file()
        if (!file) {
          return reply.status(400).send({ error: 'No file uploaded. Send a .zip or .tar.gz file.' })
        }

        const chunks: Buffer[] = []
        for await (const chunk of file.file) {
          chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)

        if (buffer.byteLength > MAX_PACKAGE_SIZE) {
          return reply.status(400).send({
            error: `File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Max: 50 MB.`,
          })
        }

        // Validate package without extracting
        const validation = await validatePackageBuffer(buffer, file.filename)
        const { manifest } = validation

        // Check for conflicts
        const existing = await prisma.app.findUnique({ where: { appId: manifest.id } })
        if (existing) {
          return reply.status(409).send({
            error: `App "${manifest.id}" already exists (source: ${existing.source}). Uninstall it first to re-upload.`,
          })
        }

        // Extract to apps directory
        const registry = getAppRegistry()
        const targetDir = path.join(registry.getAppsDir(), manifest.id)
        await extractPackage(buffer, file.filename, targetDir)

        // APAV-style vetting: the platform validates the extracted package
        // itself and refuses to install anything with errors.
        const vetting = await vetApp(targetDir)
        logVettingResult(manifest.id, vetting)
        if (vetting.errors.length > 0) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true })
          }
          return reply.status(422).send({
            status: 'REJECTED',
            appId: manifest.id,
            errors: vetting.errors,
            warnings: vetting.warnings,
          })
        }

        // Install the app
        await registry.install(manifest.id, 'CUSTOM')

        reply.send({
          message: `App "${manifest.name}" uploaded and installed successfully`,
          appId: manifest.id,
          name: manifest.name,
          version: manifest.version,
          vetting: { status: 'APPROVED', warnings: vetting.warnings },
        })
      } catch (error) {
        loggerService.error('Error uploading app:', error)
        const msg = error instanceof Error ? error.message : 'Error uploading app package'
        reply.status(400).send({ error: msg })
      }
    },
  })

  // ------------------------------------------------------------------
  // Install an app from a remote URL
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.post('/install-from-url', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Install app from URL',
      description: 'Downloads and installs an app package from a remote URL (.zip or .tar.gz)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            appId: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string' },
            vetting: vettingApprovedSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
        422: vettingRejectedSchema,
        502: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{ Body: { url: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { url } = request.body

        // Validate the URL (SSRF prevention, scheme, extension)
        try {
          await validateDownloadUrl(url)
        } catch (valError) {
          const msg = valError instanceof Error ? valError.message : 'Invalid URL'
          return reply.status(400).send({ error: msg })
        }

        // Download the package
        let buffer: Buffer
        let filename: string
        try {
          const result = await downloadAppPackage(url)
          buffer = result.buffer
          filename = result.filename
        } catch (dlError) {
          const msg = dlError instanceof Error ? dlError.message : 'Download failed'
          return reply.status(502).send({ error: `Download failed: ${msg}` })
        }

        // Validate the package
        const validation = await validatePackageBuffer(buffer, filename)
        const { manifest } = validation

        // Check for conflicts
        const existing = await prisma.app.findUnique({ where: { appId: manifest.id } })
        if (existing) {
          return reply.status(409).send({
            error: `App "${manifest.id}" already exists (source: ${existing.source}). Uninstall it first to re-upload.`,
          })
        }

        // Extract and install
        const registry = getAppRegistry()
        const targetDir = path.join(registry.getAppsDir(), manifest.id)
        await extractPackage(buffer, filename, targetDir)

        // APAV-style vetting: the platform validates the extracted package
        // itself and refuses to install anything with errors.
        const vetting = await vetApp(targetDir)
        logVettingResult(manifest.id, vetting)
        if (vetting.errors.length > 0) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true })
          }
          return reply.status(422).send({
            status: 'REJECTED',
            appId: manifest.id,
            errors: vetting.errors,
            warnings: vetting.warnings,
          })
        }

        await registry.install(manifest.id, 'CUSTOM')

        reply.send({
          message: `App "${manifest.name}" installed from URL successfully`,
          appId: manifest.id,
          name: manifest.name,
          version: manifest.version,
          vetting: { status: 'APPROVED', warnings: vetting.warnings },
        })
      } catch (error) {
        loggerService.error('Error installing app from URL:', error)
        const msg = error instanceof Error ? error.message : 'Error installing app from URL'
        reply.status(400).send({ error: msg })
      }
    },
  })

  // ------------------------------------------------------------------
  // Get customer-specific app settings
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.get('/:appId/settings', {
    preHandler: [verifyToken],
    schema: {
      tags: ['apps'],
      summary: 'Get app settings',
      description: 'Returns the settings for an app, merged with defaults from the manifest',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (
      request: FastifyRequest<{ Params: { appId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const app = await prisma.app.findUnique({
          where: { appId: request.params.appId },
          include: {
            settings: true,
            installations: { where: { customerId }, take: 1 },
          },
        })

        if (!app) {
          return reply.status(404).send({ error: 'App not found' })
        }

        const installation = app.installations[0]
        const savedSettings = (installation?.settings as Record<string, unknown>) ?? {}

        // Merge saved settings with defaults
        const settings = app.settings.map((def) => ({
          key: def.key,
          type: def.type,
          label: def.label,
          description: def.description,
          required: def.required,
          options: def.options,
          default: def.defaultValue,
          value: savedSettings[def.key] ?? def.defaultValue ?? null,
        }))

        reply.send({ appId: app.appId, settings })
      } catch (error) {
        loggerService.error('Error fetching app settings:', error)
        reply.status(500).send({ error: 'Error fetching app settings' })
      }
    },
  })

  // ------------------------------------------------------------------
  // Update customer-specific app settings
  // ------------------------------------------------------------------

  // @ts-ignore
  fastify.put('/:appId/settings', {
    preHandler: [verifyToken, hasPermission('apps', 'write')],
    schema: {
      tags: ['apps'],
      summary: 'Update app settings',
      description: 'Updates customer-specific settings for an installed app',
      params: {
        type: 'object',
        required: ['appId'],
        properties: { appId: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          settings: { type: 'object', additionalProperties: true },
        },
        required: ['settings'],
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { appId: string }
        Body: { settings: Record<string, unknown> }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const customerId = request.user?.customerId
        if (!customerId) {
          return reply.status(401).send({ error: 'Authentication required' })
        }

        const app = await prisma.app.findUnique({
          where: { appId: request.params.appId },
          include: { settings: true },
        })

        if (!app) {
          return reply.status(404).send({ error: 'App not found' })
        }

        // Validate setting keys exist in definitions
        const validKeys = new Set(app.settings.map((s) => s.key))
        const invalidKeys = Object.keys(request.body.settings).filter((k) => !validKeys.has(k))
        if (invalidKeys.length > 0) {
          return reply.status(400).send({
            error: `Unknown settings: ${invalidKeys.join(', ')}`,
          })
        }

        // Validate required settings
        for (const def of app.settings) {
          if (def.required && request.body.settings[def.key] === undefined) {
            return reply.status(400).send({
              error: `Setting "${def.key}" is required`,
            })
          }
        }

        const installation = await prisma.appInstallation.findUnique({
          where: { appId_customerId: { appId: app.id, customerId } },
        })

        if (!installation) {
          return reply.status(404).send({
            error: 'App is not installed for this customer. Enable it first.',
          })
        }

        // Merge with existing settings
        const existingSettings = (installation.settings as Record<string, unknown>) ?? {}
        const mergedSettings = { ...existingSettings, ...request.body.settings }

        await prisma.appInstallation.update({
          where: { id: installation.id },
          data: { settings: mergedSettings as any },
        })

        reply.send({ message: 'Settings updated successfully' })
      } catch (error) {
        loggerService.error('Error updating app settings:', error)
        reply.status(500).send({ error: 'Error updating app settings' })
      }
    },
  })
}

export default appManagementRoutes

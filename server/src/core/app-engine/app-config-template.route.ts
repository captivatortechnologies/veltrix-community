// ========================================================================
// App Configuration Template Routes
//
// GET /api/apps/:appId/config-types/:configTypeId/canvas
//   — the app's Configuration Canvas template (canvas.yaml) for that config
//     type, parsed to JSON, so a generic client authoring surface can render
//     the form without any app-specific code.
//
// GET /api/apps/:appId/config-types/:configTypeId/defaults
//   — the config type's default values (defaults.yaml) parsed to JSON, or an
//     empty object when the manifest declares no defaults.
//
// AUTH: verifyToken (unlike the client-bundle/branding routes, which are
// intentionally unauthenticated because browser <script>/<img> loads cannot
// attach a Bearer header). These are consumed by an authFetch that always
// carries the platform's Authorization: Bearer header.
//
// R3 (RBAC/IdP hardening, 2026-07-10): also gated by hasAppPermission(appId,
// configTypeId, 'read') — design decision 1 ("config types use
// resource = configTypeId"). A page's authoring form is exactly the API
// surface this route backs, so this is the page-level requiresPermission
// enforcement for configuration-canvas pages, applied server-side.
//
// The canvas/defaults YAML is returned VERBATIM (schema-less send): field
// names such as `fieldType` are preserved so the client adapter can map them
// (fieldType -> type). Attaching a strict response schema would silently drop
// nested sections[].fields[] properties via fast-json-stringify.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import * as yaml from 'js-yaml'
import { verifyToken } from '../../middlewares/authMiddleware'
import { hasAppPermission } from './app-route-registrar'
import { loggerService } from '../../module/logger/logger.service'
import { getAppRegistry } from '../platform-bootstrap'
import prisma from '../../db'

/** Same shape the app packager enforces for app ids; also blocks traversal. */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

type TemplateKind = 'canvas' | 'defaults'

interface RouteParams {
  appId: string
  configTypeId: string
}

/**
 * Shared handler for both the /canvas and /defaults routes. They differ only
 * in which manifest field points at the YAML file and in whether an undeclared
 * file is an error (canvas) or an empty object (defaults).
 */
function makeConfigTemplateHandler(kind: TemplateKind) {
  return async (
    request: FastifyRequest<{ Params: RouteParams }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const { appId, configTypeId } = request.params

    // Path-traversal guard FIRST — nothing derived from appId touches the
    // filesystem unless it matches the strict slug shape.
    if (!APP_ID_PATTERN.test(appId)) {
      return reply.status(400).send({ error: 'Invalid app id' })
    }

    let registry: ReturnType<typeof getAppRegistry>
    try {
      registry = getAppRegistry()
    } catch {
      return reply.status(503).send({ error: 'Platform not initialized' })
    }

    const loaded = registry.getLoadedApp(appId)
    if (!loaded) {
      return reply.status(404).send({ error: 'App not found' })
    }

    const appDir = loaded.dir || path.join(registry.getAppsDir(), appId)

    const configType = loaded.manifest.pipeline?.configurationTypes?.find(
      (ct) => ct.id === configTypeId,
    )
    if (!configType) {
      return reply.status(404).send({ error: 'Configuration type not found' })
    }

    // Which manifest-declared file to serve for this route.
    const relPath = kind === 'canvas' ? configType.canvasTemplate : configType.defaultConfig

    // /defaults with no declared defaultConfig is a success with no values.
    if (kind === 'defaults' && (typeof relPath !== 'string' || relPath.trim() === '')) {
      return reply.header('Cache-Control', 'no-cache').send({})
    }

    if (typeof relPath !== 'string' || relPath.trim() === '') {
      // A canvas template is required for a config type; treat a missing
      // declaration as an absent template.
      return reply.status(404).send({ error: 'Canvas template not found' })
    }

    // Defence in depth: a manifest-declared path may not point outside its
    // own app dir. Mirrors app-client-bundle.route.ts before fs.readFileSync.
    const appRoot = path.resolve(appDir)
    const resolved = path.resolve(appRoot, relPath)
    if (resolved !== appRoot && !resolved.startsWith(appRoot + path.sep)) {
      return reply.status(400).send({ error: 'Invalid template path' })
    }

    if (!fs.existsSync(resolved)) {
      return reply
        .status(404)
        .send({ error: kind === 'canvas' ? 'Canvas template not found' : 'Defaults not found' })
    }

    let parsed: unknown
    try {
      const raw = fs.readFileSync(resolved, 'utf8')
      parsed = yaml.load(raw)
    } catch (error) {
      loggerService.error(
        `Failed to read/parse ${kind} template for "${appId}/${configTypeId}":`,
        error,
      )
      return reply.status(500).send({
        error: kind === 'canvas' ? 'Invalid canvas template' : 'Invalid default config',
      })
    }

    // Return the parsed YAML as-is (no field-name transformation). Empty/blank
    // files yaml.load to undefined — normalize to {} so the client always
    // receives an object.
    return reply.header('Cache-Control', 'no-cache').send(parsed ?? {})
  }
}

/**
 * `:configTypeId` is per-request, so the permission check must be built
 * fresh per request rather than as a single static preHandler bound at
 * route-registration time (hasAppPermission's closures are bound to fixed
 * strings). Config types use `resource = configTypeId` (design decision 1).
 *
 * `request.params.appId` is the manifest/URL SLUG (e.g. "crowdstrike-edr"),
 * but `Permission.appId` is a foreign key to `App.id` (a UUID) — role grants
 * made through the role API are always keyed by that id (role.route.ts,
 * resource-catalog.ts), never the slug. Resolve it before checking, or an
 * app-scoped grant can never match (caught by e2e/tests/rbac-permissions.spec.ts
 * against the real DB — the FK constraint means a slug-keyed Permission row
 * can't even be persisted, so this mismatch is silent in any test that mocks
 * the permission query directly rather than exercising the real schema).
 */
async function ensureConfigTypeReadPermission(
  request: FastifyRequest<{ Params: RouteParams }>,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  const { appId: appSlug, configTypeId } = request.params
  const app = await prisma.app.findUnique({ where: { appId: appSlug }, select: { id: true } })
  return hasAppPermission(app?.id ?? null, configTypeId, 'read')(request, reply)
}

/**
 * Register the config-template routes on the given Fastify instance. Called
 * from appManagementRoutes so they live under the /api/apps prefix.
 *
 * Deliberately schema-less: a response-serialization schema would strip nested
 * sections[].fields[] properties from the parsed canvas/defaults body.
 */
export function registerAppConfigTemplateRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/:appId/config-types/:configTypeId/canvas',
    { preHandler: [verifyToken, ensureConfigTypeReadPermission] },
    makeConfigTemplateHandler('canvas'),
  )
  fastify.get(
    '/:appId/config-types/:configTypeId/defaults',
    { preHandler: [verifyToken, ensureConfigTypeReadPermission] },
    makeConfigTemplateHandler('defaults'),
  )
}

export default registerAppConfigTemplateRoutes

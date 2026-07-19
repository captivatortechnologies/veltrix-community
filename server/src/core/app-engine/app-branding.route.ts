// ========================================================================
// App Branding Routes
//
// GET /api/apps/:appId/branding/logo       — the app's navbar logo
// GET /api/apps/:appId/branding/logo-dark  — optional dark-background variant
//
// Serves ONLY the file the app's manifest declares under `branding.logo` /
// `branding.logoDark`. Nothing else in the app directory is reachable:
// the appId must match the strict slug shape before anything touches the
// filesystem, the manifest-declared path must stay inside the app dir
// (no '..' segments), only .svg/.png at most MAX_LOGO_BYTES are served.
//
// AUTH: intentionally NO verifyToken — <img> tags cannot attach the
// platform's Authorization: Bearer header, and logos are public marketplace
// assets (the same files anyone can download from the marketplace).
//
// SVG defense in depth: vetting rejects script-bearing SVGs at install
// time, and the response additionally ships X-Content-Type-Options: nosniff
// plus a Content-Security-Policy that blocks scripts/loads even if a
// malicious SVG were opened as a top-level document.
//
// This module also owns `buildEnabledBranding`, the mapper the /enabled
// route uses to expose branding to the client — kept here so the "does this
// manifest declare a servable logo?" logic exists exactly once.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getAppRegistry } from '../platform-bootstrap'
import type { AppBrandingDeclaration } from '../../../../shared/types/app'

/** Same shape the app packager/bundle route enforce; also blocks traversal. */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

/** #RGB or #RRGGBB — anything else never reaches the client (defense in depth). */
export const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Navbar logos render at ~28px height; matches the packaging/vetting cap. */
export const MAX_LOGO_BYTES = 128 * 1024

const LOGO_CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/**
 * Resolve a manifest-declared branding logo reference to an absolute file
 * path, or null when it is not servable: non-string/empty, contains '..'
 * segments, escapes the app directory, is not .svg/.png, does not exist,
 * or exceeds MAX_LOGO_BYTES.
 */
export function resolveBrandingLogoFile(appDir: string, ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  if (ref.split(/[\\/]/).includes('..')) return null

  const ext = path.extname(ref).toLowerCase()
  if (!(ext in LOGO_CONTENT_TYPES)) return null

  const appRoot = path.resolve(appDir)
  const full = path.resolve(appRoot, ref.replace(/^\.\//, ''))
  // Defence in depth: the resolved file must stay inside the app dir.
  if (full !== appRoot && !full.startsWith(appRoot + path.sep)) return null

  try {
    const stat = fs.statSync(full)
    if (!stat.isFile() || stat.size > MAX_LOGO_BYTES) return null
  } catch {
    return null
  }
  return full
}

/**
 * A branding logo may be declared as an absolute `https://` URL instead of a
 * repo-relative file. Such a logo is rendered by the browser directly from the
 * remote host (a CDN/vendor asset) and never touches the platform's branding
 * route, so no local file resolution or size/script vetting applies.
 */
export function isHttpsLogoUrl(ref: unknown): ref is string {
  return typeof ref === 'string' && /^https:\/\//i.test(ref.trim())
}

/** Branding shape of each entry in the GET /api/apps/enabled payload. */
export interface EnabledAppBranding {
  primaryColor?: string
  accentColor?: string
  logoUrl?: string
  logoDarkUrl?: string
}

/**
 * Map a manifest `branding` declaration to the /enabled payload shape.
 * Colors pass through only when they are valid hex; logo URLs are included
 * only when the declared file actually resolves to something the branding
 * route would serve. Returns undefined when nothing usable is declared so
 * the field is omitted from the JSON entirely.
 */
export function buildEnabledBranding(
  appId: string,
  appDir: string,
  branding: AppBrandingDeclaration | undefined | null,
): EnabledAppBranding | undefined {
  if (!branding || typeof branding !== 'object') return undefined

  const out: EnabledAppBranding = {}
  if (typeof branding.primaryColor === 'string' && HEX_COLOR_PATTERN.test(branding.primaryColor)) {
    out.primaryColor = branding.primaryColor
  }
  if (typeof branding.accentColor === 'string' && HEX_COLOR_PATTERN.test(branding.accentColor)) {
    out.accentColor = branding.accentColor
  }
  // Logo: an https:// URL is exposed verbatim (the browser loads it directly);
  // a repo-relative file is served through the platform's branding route, and
  // only when the declared file actually resolves to a servable asset.
  if (isHttpsLogoUrl(branding.logo)) {
    out.logoUrl = branding.logo.trim()
  } else if (resolveBrandingLogoFile(appDir, branding.logo)) {
    out.logoUrl = `/api/apps/${appId}/branding/logo`
  }
  if (isHttpsLogoUrl(branding.logoDark)) {
    out.logoDarkUrl = branding.logoDark.trim()
  } else if (resolveBrandingLogoFile(appDir, branding.logoDark)) {
    out.logoDarkUrl = `/api/apps/${appId}/branding/logo-dark`
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function makeLogoHandler(brandingKey: 'logo' | 'logoDark') {
  return async (
    request: FastifyRequest<{ Params: { appId: string } }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const { appId } = request.params

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
      return reply.status(404).send({ error: `App "${appId}" is not installed` })
    }

    const appDir = loaded.dir || path.join(registry.getAppsDir(), appId)
    const file = resolveBrandingLogoFile(appDir, loaded.manifest.branding?.[brandingKey])
    if (!file) {
      return reply.status(404).send({ error: 'App has no logo' })
    }

    return reply
      .header('X-Content-Type-Options', 'nosniff')
      // SVG defense in depth: even opened as a document, it can run nothing
      // and load nothing (inline styles stay allowed for presentation).
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('Cache-Control', 'no-cache')
      .type(LOGO_CONTENT_TYPES[path.extname(file).toLowerCase()])
      .send(fs.readFileSync(file))
  }
}

/**
 * Register the branding logo routes on the given Fastify instance. Called
 * from appManagementRoutes so they live under the /api/apps prefix.
 *
 * Deliberately schema-less: a response-serialization schema would mangle the
 * binary/SVG body.
 */
export function registerAppBrandingRoutes(fastify: FastifyInstance): void {
  fastify.get('/:appId/branding/logo', makeLogoHandler('logo'))
  fastify.get('/:appId/branding/logo-dark', makeLogoHandler('logoDark'))
}

export default registerAppBrandingRoutes

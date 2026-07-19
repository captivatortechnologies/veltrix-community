// ========================================================================
// App Vetting Service (APAV-style server-side package vetting)
//
// Kept in sync with veltrix-apps cli/src/lib/validator.mjs — the canonical
// check corpus. Update both together.
//
// The platform no longer trusts that CI validated an app package: every
// package that arrives through a network install path (upload, install
// from URL, marketplace install) is vetted here AFTER extraction and
// BEFORE registration. Any error rejects the install with an itemized
// report; warnings are surfaced but do not block.
//
// Checks (mirroring the CLI validator's validateApp + checkClientBundle):
//   - manifest.yaml schema (id, version, category, platform.minVersion)
//   - branding (hex colors, logo path safety, .svg/.png <=128KB, SVG
//     scripting/event-handler/foreignObject rejection)
//   - package.json <-> manifest version consistency, runtime dependencies
//   - permissions arrays, settings schema, duplicate keys/resources
//   - pipeline configurationTypes (handlers exist, canvas/defaults exist,
//     componentTypes non-empty, duplicate ids)
//   - canvas.yaml schema + defaults.yaml cross-check
//   - client.pages UI/navigation contract
//   - canonical layout conventions (warnings)
//   - file-tree rules (no executables, 50 MB cap, no symlinks, dotfiles)
//   - import boundaries (no escaping the app dir, no @prisma/*)
//   - in-process safety (child_process/vm/worker_threads/cluster, eval,
//     new Function, process.exit; fs/os flagged for review)
//   - packaging hygiene (merge-conflict markers, secret scanning)
//   - client bundle dry-run (esbuild, write: false — failure is an error)
//
// NOTE: the raw YAML is parsed directly (not via manifest-parser's
// parseManifest) because parseManifest normalizes the manifest — it
// defaults platform.minVersion, page nav/layout, etc. — which would
// silently weaken several of these checks.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { build, Plugin } from 'esbuild'
import { resolveClientEntryFile } from './client-entry-resolver'

export interface VetResult {
  errors: string[]
  warnings: string[]
  manifest?: any
}

// ---------------------------------------------------------------------------
// Check corpus constants (kept identical to cli/src/lib/validator.mjs)
// ---------------------------------------------------------------------------

const APP_ID_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const TABLE_PREFIX_RE = /^[a-z][a-z0-9_]*_$/
const FORBIDDEN_EXTENSIONS = new Set(['.sh', '.bat', '.exe', '.cmd', '.ps1'])
const MAX_PACKAGE_SIZE = 50 * 1024 * 1024
const REQUIRED_HANDLERS = ['validate', 'deploy', 'rollback', 'healthCheck', 'getStatus']
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
// Extensionless manifest refs (handlers, entries) resolve like require() does
const RESOLVE_CANDIDATES = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.js']
const CATEGORIES = new Set(['SIEM', 'EDR', 'SOAR', 'IAM', 'NETWORK', 'CLOUD', 'COMPLIANCE', 'CUSTOM'])
// App UI & navigation contract (mirrors @veltrixsecops/app-sdk)
const APP_PAGE_LAYOUTS = ['standard', 'full-bleed', 'canvas']
const APP_PAGE_NAV = ['sidebar', 'tab', 'hidden']
// Configuration Canvas contract (mirrors the platform's canvas renderer)
const CANVAS_FIELD_TYPES = new Set([
  'text',
  'number',
  'select',
  'checkbox',
  'textarea',
  'tags',
  'password',
  'path',
])
const SETTING_TYPES = new Set(['string', 'number', 'boolean', 'select'])
// Onboarding providers the platform can drive. Mirrors the registry in
// server/src/module/connection-onboarding/index.ts; kept as a local literal so
// vetting stays free of the DB/adapter import graph.
const ONBOARDING_PROVIDERS = new Set(['entra-admin-consent'])
// Apps run in-process inside the platform server — modules that spawn
// processes, evaluate code, or reach into the runtime are not allowed.
const FORBIDDEN_MODULES = new Set([
  'child_process',
  'node:child_process',
  'vm',
  'node:vm',
  'worker_threads',
  'node:worker_threads',
  'cluster',
  'node:cluster',
])
// Filesystem/OS access is almost never needed by an API-driven app; flag it
// for review rather than banning it outright.
const REVIEW_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'os', 'node:os'])
// Dotfiles that are legitimately part of a repo checkout but never a package
const ALLOWED_DOTFILES = new Set(['.gitignore', '.npmrc', '.eslintrc', '.eslintrc.json', '.prettierrc'])
const TEXT_EXTENSIONS = new Set(['.yaml', '.yml', '.json', '.md'])
// High-confidence secret shapes (credential material must never ship in a package)
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'a private key block'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key ID'],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, 'a Slack token'],
  [/\bgh[pousr]_[0-9A-Za-z]{36,}\b/, 'a GitHub token'],
]
// Heuristic secret assignment (warning — review, may be a fixture)
const SECRET_ASSIGNMENT_RE =
  /\b(client_secret|api_?key|password|access_token|auth_token)\s*[:=]\s*['"][A-Za-z0-9+/_-]{20,}['"]/i
// Minimum SDK version whose ./client subpath (authFetch, host runtime) exists
const SDK_CLIENT_MIN = [1, 2]
// Navbar logos render at ~28px height — anything bigger than this is unoptimized
const MAX_LOGO_BYTES = 128 * 1024

// ---------------------------------------------------------------------------
// Client-bundle dry-run shim plugin
//
// Mirrors the host-runtime shim plugin used by the app client bundle route
// (app-client-bundle.route.ts) and the CLI packager (client-bundler.mjs):
// react/* and @veltrixsecops/app-sdk/* are compile-time replaced with shims
// that read the host runtime global. Reimplemented here (rather than
// imported) so vetting has no coupling to the serving route.
// ---------------------------------------------------------------------------

const HOST_RUNTIME_GLOBAL = '__VELTRIX_APP_RUNTIME__'

const SHIM_PROPS: Record<string, string> = {
  react: 'react',
  'react-dom': 'reactDom',
  'react-dom/client': 'reactDomClient',
  'react/jsx-runtime': 'jsxRuntime',
  'react/jsx-dev-runtime': 'jsxRuntime',
  '@veltrixsecops/app-sdk': 'sdk',
  '@veltrixsecops/app-sdk/hooks': 'sdk',
  '@veltrixsecops/app-sdk/client': 'sdk',
  '@veltrixsecops/app-sdk/ui': 'ui',
}

const SHIM_FILTER =
  /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime|@veltrixsecops\/app-sdk(\/(hooks|client|ui))?)$/

function hostShimPlugin(): Plugin {
  return {
    name: 'veltrix-vetting-host-shims',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: SHIM_FILTER }, (args) => ({
        path: args.path,
        namespace: 'veltrix-vetting-host-shim',
      }))
      // CJS shim bodies — esbuild's interop turns named imports into
      // property accesses on the host module object.
      pluginBuild.onLoad({ filter: /.*/, namespace: 'veltrix-vetting-host-shim' }, (args) => ({
        contents:
          `const rt = globalThis.${HOST_RUNTIME_GLOBAL}\n` +
          `if (!rt) throw new Error('Veltrix host runtime not found — app client bundles only run inside the Veltrix platform')\n` +
          `module.exports = rt.${SHIM_PROPS[args.path]}\n`,
        loader: 'js',
      }))
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Vet an extracted app package directory against the full platform contract.
 * Returns an itemized report; any entry in `errors` means the package must
 * be rejected (the caller is responsible for cleanup and the 422 response).
 */
export async function vetApp(appDirArg: string): Promise<VetResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const err = (m: string) => errors.push(m)
  const warn = (m: string) => warnings.push(m)

  const appDir = path.resolve(appDirArg)
  const dirName = path.basename(appDir)

  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) {
    return { errors: [`App directory not found: ${appDirArg}`], warnings }
  }

  const fileExists = (rel: string) =>
    RESOLVE_CANDIDATES.some((suffix) => {
      const p = path.join(appDir, rel + suffix)
      return fs.existsSync(p) && fs.statSync(p).isFile()
    })

  const requireFile = (rel: unknown, label: string) => {
    if (typeof rel !== 'string' || !rel.trim()) {
      err(`${label} is missing or empty`)
      return
    }
    if (rel.split(/[\\/]/).includes('..')) {
      err(`${label} must not contain '..' path segments: "${rel}"`)
      return
    }
    if (!fileExists(rel)) err(`${label} points to a missing file: "${rel}"`)
  }

  // --- Manifest ---------------------------------------------------------
  const manifestPath = path.join(appDir, 'manifest.yaml')
  if (!fs.existsSync(manifestPath)) {
    return { errors: [`manifest.yaml not found in ${appDirArg}`], warnings }
  }

  let manifest: any
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'))
  } catch (e: any) {
    return { errors: [`manifest.yaml is not valid YAML: ${e.message}`], warnings }
  }
  if (!manifest || typeof manifest !== 'object') {
    return { errors: ['manifest.yaml did not parse to an object'], warnings }
  }

  // Identity
  if (!manifest.id || !APP_ID_RE.test(manifest.id)) {
    err(`manifest.id must match ${APP_ID_RE} (got "${manifest.id}")`)
  } else if (manifest.id !== dirName && !dirName.startsWith('_')) {
    // _-prefixed directories (the _template) are scaffolding, not installable apps
    err(`manifest.id ("${manifest.id}") must equal the app directory name ("${dirName}")`)
  }
  for (const field of ['name', 'version', 'vendor', 'description', 'category']) {
    if (!manifest[field] || typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      err(`manifest.${field} is required`)
    }
  }
  if (manifest.version && !SEMVER_RE.test(manifest.version)) {
    err(`manifest.version must be semver (got "${manifest.version}")`)
  }
  if (manifest.category && !CATEGORIES.has(manifest.category)) {
    warn(`manifest.category "${manifest.category}" is not one of ${[...CATEGORIES].join(', ')}`)
  }
  if (!manifest.platform?.minVersion) warn('manifest.platform.minVersion is not set')

  // Version consistency — the release tag, catalog entry, and npm metadata all
  // key off manifest.version; a diverging package.json version ships confusion.
  const pkgPath = path.join(appDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.version && manifest.version && pkg.version !== manifest.version) {
        err(
          `packaging: package.json version ("${pkg.version}") must equal manifest.version ` +
            `("${manifest.version}")`,
        )
      }
      if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
        warn(
          'packaging: package.json declares runtime "dependencies" — the platform only ' +
            'guarantees @veltrixsecops/app-sdk at runtime; bundle or vendor anything else',
        )
      }
    } catch (e: any) {
      err(`packaging: package.json is not valid JSON: ${e.message}`)
    }
  } else {
    warn('packaging: package.json is missing (needed for typecheck and version tracking)')
  }

  if (manifest.homepage && !/^https:\/\//.test(manifest.homepage)) {
    warn(`manifest.homepage should be an https:// URL (got "${manifest.homepage}")`)
  }
  if (typeof manifest.icon === 'string' && /[\\/]/.test(manifest.icon)) {
    // Path-style icons must exist; emoji icons pass through untouched
    requireFile(manifest.icon.replace(/^\.\//, ''), 'manifest.icon')
  }

  // Branding — rendered by the platform in the app navbar and as scoped CSS
  // variables; logos are served to browsers, so they are size/type/script
  // checked here rather than trusted.
  if (manifest.branding) {
    const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
    for (const key of ['primaryColor', 'accentColor']) {
      const value = manifest.branding[key]
      if (value !== undefined && !HEX_COLOR_RE.test(String(value))) {
        err(`branding: ${key} must be a #RGB or #RRGGBB hex color (got "${value}")`)
      }
    }
    for (const key of ['logo', 'logoDark']) {
      const ref = manifest.branding[key]
      if (ref === undefined) continue
      if (typeof ref !== 'string' || !ref.trim()) {
        err(`branding: ${key} must be a repo-relative .svg/.png file path or an https:// URL`)
        continue
      }
      // An https:// URL is rendered by the browser directly from the remote
      // host, so the platform cannot size/script-check it — require https only.
      if (/^https:\/\//i.test(ref.trim())) {
        continue
      }
      if (ref.split(/[\\/]/).includes('..')) {
        err(`branding: ${key} must not contain '..' path segments: "${ref}"`)
        continue
      }
      const ext = path.extname(ref).toLowerCase()
      if (ext !== '.svg' && ext !== '.png') {
        err(`branding: ${key} must be an .svg (preferred) or .png file (got "${ref}")`)
      }
      const full = path.join(appDir, ref.replace(/^\.\//, ''))
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        err(`branding: ${key} points to a missing file: "${ref}"`)
        continue
      }
      if (fs.statSync(full).size > MAX_LOGO_BYTES) {
        err(
          `branding: ${key} exceeds ${MAX_LOGO_BYTES / 1024} KB — navbar logos render at ~28px height; use a small optimized asset`,
        )
      }
      if (ext === '.svg') {
        const svg = fs.readFileSync(full, 'utf8')
        if (/<script|\bon[a-z]+\s*=|javascript:|<foreignObject/i.test(svg)) {
          err(`branding: ${key} SVG contains scripting or event handlers — not allowed in logos`)
        }
      }
    }
  }

  // Permissions
  if (!Array.isArray(manifest.permissions?.platform)) {
    err('manifest.permissions.platform must be an array (may be empty)')
  }
  if (!Array.isArray(manifest.permissions?.app)) {
    err('manifest.permissions.app must be an array (may be empty)')
  } else {
    const seenResources = new Set<string>()
    manifest.permissions.app.forEach((p: any, i: number) => {
      if (!p?.resource) err(`permissions.app[${i}].resource is required`)
      if (!Array.isArray(p?.actions) || p.actions.length === 0) {
        err(`permissions.app[${i}].actions must be a non-empty array`)
      }
      if (p?.resource) {
        if (seenResources.has(p.resource)) {
          err(`permissions.app[${i}].resource "${p.resource}" is declared more than once`)
        }
        seenResources.add(p.resource)
      }
    })
  }

  // Settings — admins edit these through a generated form; a malformed
  // declaration renders as a broken control or silently drops the value.
  ;(manifest.settings ?? []).forEach((setting: any, i: number) => {
    const label = `settings[${i}]${setting?.key ? ` (${setting.key})` : ''}`
    if (!setting?.key || typeof setting.key !== 'string') err(`settings: ${label}.key is required`)
    if (!setting?.label) err(`settings: ${label}.label is required`)
    if (!SETTING_TYPES.has(setting?.type)) {
      err(`settings: ${label}.type must be one of ${[...SETTING_TYPES].join(', ')} (got "${setting?.type}")`)
    }
    if (setting?.type === 'select') {
      if (!Array.isArray(setting.options) || setting.options.length === 0) {
        err(`settings: ${label} is a select but declares no options`)
      } else if (
        setting.default !== undefined &&
        !setting.options.some((o: any) => o?.value === setting.default)
      ) {
        err(`settings: ${label}.default "${setting.default}" is not one of its option values`)
      }
    } else if (setting?.default !== undefined && setting?.type && SETTING_TYPES.has(setting.type)) {
      if (typeof setting.default !== setting.type) {
        err(
          `settings: ${label}.default must be a ${setting.type} (got ${typeof setting.default})`,
        )
      }
    }
  })
  {
    const keys = (manifest.settings ?? []).map((s: any) => s?.key).filter(Boolean)
    const dupes = keys.filter((k: string, i: number) => keys.indexOf(k) !== i)
    for (const key of new Set(dupes)) err(`settings: key "${key}" is declared more than once`)
  }

  // Connection onboarding descriptor (optional). The platform knows only a
  // fixed set of onboarding providers; the descriptor's params are provider-
  // specific and validated at runtime by the adapter, so vetting only checks
  // the shape + that the provider is one the platform can drive.
  {
    const onboarding = manifest.connection?.onboarding
    if (onboarding) {
      if (!onboarding.provider || typeof onboarding.provider !== 'string') {
        err('connection.onboarding.provider is required')
      } else if (!ONBOARDING_PROVIDERS.has(onboarding.provider)) {
        err(
          `connection.onboarding.provider "${onboarding.provider}" is not a known onboarding provider ` +
            `(${[...ONBOARDING_PROVIDERS].join(', ')})`,
        )
      }
      if (!onboarding.label || typeof onboarding.label !== 'string') {
        err('connection.onboarding.label is required')
      }
      const settingKeys = new Set((manifest.settings ?? []).map((s: any) => s?.key).filter(Boolean))
      for (const key of onboarding.params?.requiredSettings ?? []) {
        if (!settingKeys.has(key)) {
          warn(
            `connection.onboarding.params.requiredSettings references "${key}", which is not a declared app setting`,
          )
        }
      }
      const capture = onboarding.params?.capture?.tenantId
      if (capture && !String(capture).startsWith('setting:')) {
        warn(`connection.onboarding.params.capture.tenantId should be of the form "setting:<key>" (got "${capture}")`)
      }
      for (const step of onboarding.params?.provisioning ?? []) {
        if (step?.type !== 'arm-role-assignment') {
          warn(`connection.onboarding: unknown provisioning step type "${step?.type}"`)
        }
      }
      if (onboarding.onboardingHandler) requireFile(onboarding.onboardingHandler, 'connection.onboarding.onboardingHandler')
    }
  }

  // Database
  if (manifest.database) {
    if (!manifest.database.tablePrefix || !TABLE_PREFIX_RE.test(manifest.database.tablePrefix)) {
      err(`database.tablePrefix must match ${TABLE_PREFIX_RE} (got "${manifest.database.tablePrefix}")`)
    }
    if (manifest.database.migrations) {
      const migDir = path.join(appDir, manifest.database.migrations)
      if (!fs.existsSync(migDir) || !fs.statSync(migDir).isDirectory()) {
        err(`database.migrations points to a missing directory: "${manifest.database.migrations}"`)
      }
    }
  }

  // Pipeline
  const configTypes = manifest.pipeline?.configurationTypes
  if (!Array.isArray(configTypes) || configTypes.length === 0) {
    err('manifest.pipeline.configurationTypes must contain at least one entry')
  } else {
    const seenConfigIds = new Set<string>()
    configTypes.forEach((ct: any, i: number) => {
      const label = `configurationTypes[${i}]${ct?.id ? ` (${ct.id})` : ''}`
      if (!ct?.id) err(`${label}.id is required`)
      if (!ct?.name) err(`${label}.name is required`)
      if (ct?.id) {
        if (seenConfigIds.has(ct.id)) err(`${label}.id "${ct.id}" is declared more than once`)
        seenConfigIds.add(ct.id)
      }
      requireFile(ct?.canvasTemplate, `${label}.canvasTemplate`)
      if (ct?.defaultConfig) requireFile(ct.defaultConfig, `${label}.defaultConfig`)
      for (const h of REQUIRED_HANDLERS) {
        requireFile(ct?.handlers?.[h], `${label}.handlers.${h}`)
      }
      if (ct?.handlers?.driftDetect) {
        requireFile(ct.handlers.driftDetect, `${label}.handlers.driftDetect`)
      }
      if (!Array.isArray(ct?.targets?.componentTypes) || ct.targets.componentTypes.length === 0) {
        err(`${label}.targets.componentTypes must be a non-empty array`)
      }

      // Canvas + defaults schemas — a malformed template renders as a broken
      // editor for every user of the config type; catch it at vetting time.
      const canvasShape = validateCanvasTemplate(appDir, ct?.canvasTemplate, label, err, warn)
      if (ct?.defaultConfig && canvasShape) {
        validateDefaultsFile(appDir, ct.defaultConfig, label, canvasShape, err, warn)
      }
    })
  }

  // --- Canonical layout conventions (warnings) -----------------------------
  // Everything for one configuration type is colocated in config-types/<id>/
  const stripRef = (p: unknown) => String(p ?? '').replace(/^\.\//, '')
  if (Array.isArray(configTypes)) {
    configTypes.forEach((ct: any) => {
      if (!ct?.id) return
      if (ct.canvasTemplate && stripRef(ct.canvasTemplate) !== `config-types/${ct.id}/canvas.yaml`) {
        warn(`layout: canvasTemplate for "${ct.id}" should be "config-types/${ct.id}/canvas.yaml" (got "${ct.canvasTemplate}")`)
      }
      if (ct.defaultConfig && stripRef(ct.defaultConfig) !== `config-types/${ct.id}/defaults.yaml`) {
        warn(`layout: defaultConfig for "${ct.id}" should be "config-types/${ct.id}/defaults.yaml" (got "${ct.defaultConfig}")`)
      }
      for (const [handler, ref] of Object.entries(ct.handlers ?? {})) {
        if (!ref) continue
        const expected = `config-types/${ct.id}/${handler}`
        if (stripRef(ref).replace(/\.(ts|js|mjs|cjs)$/, '') !== expected) {
          warn(`layout: handlers.${handler} for "${ct.id}" should be "${expected}" (got "${ref}")`)
        }
      }
    })
  }
  for (const [hook, ref] of Object.entries(manifest.hooks ?? {})) {
    if (ref && stripRef(ref).replace(/\.(ts|js|mjs|cjs)$/, '') !== `hooks/${hook}`) {
      warn(`layout: hooks.${hook} should be "hooks/${hook}" (got "${ref}")`)
    }
  }
  if (manifest.server?.entry && stripRef(manifest.server.entry).replace(/\.(ts|js)$/, '') !== 'server/index') {
    warn(`layout: server.entry should be "server/index" (got "${manifest.server.entry}")`)
  }
  if (manifest.client?.entry && stripRef(manifest.client.entry).replace(/\.(tsx|ts|jsx|js)$/, '') !== 'client/index') {
    warn(`layout: client.entry should be "client/index" (got "${manifest.client.entry}")`)
  }
  if (manifest.database?.migrations && stripRef(manifest.database.migrations).replace(/\/$/, '') !== 'migrations') {
    warn(`layout: database.migrations should be "migrations" (got "${manifest.database.migrations}")`)
  }
  if (!fs.existsSync(path.join(appDir, 'README.md'))) {
    warn('layout: add a README.md documenting what the app manages and its required credentials')
  }

  // Server / client / hooks
  requireFile(manifest.server?.entry, 'server.entry')
  const prefix = manifest.server?.routes?.prefix
  if (prefix && manifest.id && prefix !== `/api/apps/${manifest.id}`) {
    err(`server.routes.prefix must be "/api/apps/${manifest.id}" (got "${prefix}")`)
  }
  if (manifest.client?.entry) requireFile(manifest.client.entry, 'client.entry')

  // --- App UI & navigation contract ---
  const declaredPermissions = new Set(
    (manifest.permissions?.app ?? []).flatMap((p: any) =>
      (p?.actions ?? []).map((a: any) => `${p.resource}:${a}`),
    ),
  )
  const pagePaths = new Set((manifest.client?.pages ?? []).map((p: any) => p?.path))
  {
    const declared = (manifest.client?.pages ?? []).map((p: any) => p?.path).filter(Boolean)
    const dupes = declared.filter((p: string, i: number) => declared.indexOf(p) !== i)
    for (const p of new Set(dupes)) err(`client.pages path "${p}" is declared more than once`)
  }
  ;(manifest.client?.pages ?? []).forEach((page: any, i: number) => {
    const label = `client.pages[${i}]${page?.label ? ` (${page.label})` : ''}`
    if (!page?.path || !page.path.startsWith('/')) {
      err(`${label}.path must start with "/" (got "${page?.path}")`)
    }
    if (!page?.component) err(`${label}.component is required`)
    if (!page?.label) err(`${label}.label is required`)

    if (page?.layout && !APP_PAGE_LAYOUTS.includes(page.layout)) {
      err(`${label}.layout must be one of ${APP_PAGE_LAYOUTS.join(' | ')} (got "${page.layout}")`)
    }
    if (page?.nav && !APP_PAGE_NAV.includes(page.nav)) {
      err(`${label}.nav must be one of ${APP_PAGE_NAV.join(' | ')} (got "${page.nav}")`)
    }
    if (page?.nav === 'tab' && !page.parent) {
      err(`${label}.nav is "tab" so it must declare a "parent" page path`)
    }
    if (page?.parent && !pagePaths.has(page.parent)) {
      err(`${label}.parent "${page.parent}" does not match any declared page path`)
    }
    if (page?.order !== undefined && typeof page.order !== 'number') {
      err(`${label}.order must be a number`)
    }
    const rp = page?.requiresPermission
    if (rp) {
      if (!rp.resource || !rp.action) {
        err(`${label}.requiresPermission needs both "resource" and "action"`)
      } else if (!declaredPermissions.has(`${rp.resource}:${rp.action}`)) {
        err(
          `${label}.requiresPermission "${rp.resource}:${rp.action}" is not declared in ` +
            'permissions.app — a page cannot require a permission the app does not expose',
        )
      }
    }
    if (page?.sidebar !== undefined && page?.nav === undefined) {
      warn(`${label}: "sidebar" is deprecated — use nav: "${page.sidebar ? 'sidebar' : 'hidden'}"`)
    }
  })
  for (const [hook, rel] of Object.entries(manifest.hooks ?? {})) {
    requireFile(rel, `hooks.${hook}`)
  }

  // --- File-tree rules ----------------------------------------------------
  let totalBytes = 0
  const codeFiles: string[] = []
  const textFiles: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(appDir, full)
      // Symlinks can smuggle content from outside the app directory into a
      // package (or dangle after extraction) — never legitimate in an app.
      if (entry.isSymbolicLink()) {
        err(`security: symlinks are not allowed: ${rel}`)
        continue
      }
      if (entry.name.startsWith('.') && !ALLOWED_DOTFILES.has(entry.name)) {
        warn(`packaging: hidden ${entry.isDirectory() ? 'directory' : 'file'} "${rel}" — remove it or it ships in the package`)
        if (entry.isDirectory()) continue
      }
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        err(`Executable files are not allowed: ${rel}`)
      }
      totalBytes += fs.statSync(full).size
      if (CODE_EXTENSIONS.has(ext)) codeFiles.push(full)
      else if (TEXT_EXTENSIONS.has(ext)) textFiles.push(full)
    }
  }
  walk(appDir)

  if (totalBytes > MAX_PACKAGE_SIZE) {
    err(`App exceeds the 50 MB size limit (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)
  }

  // --- Import boundaries + in-process safety --------------------------------
  // App code runs inside the platform server process; modules and constructs
  // that spawn processes, evaluate strings as code, or kill the process are
  // treated the way AppInspect treats them for Splunk Cloud vetting.
  const IMPORT_RE = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g
  for (const file of codeFiles) {
    const relFile = path.relative(appDir, file)
    const isTestFile = /(^|[\\/])__tests__[\\/]/.test(relFile) || /\.test\.[a-z]+$/.test(relFile)
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1]
      if (spec.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), spec)
        if (!resolved.startsWith(appDir + path.sep) && resolved !== appDir) {
          err(
            `${relFile} imports "${spec}" which escapes the app directory — ` +
              'apps may only import their own files and published packages',
          )
        }
      } else if (spec === '@prisma/client' || spec.startsWith('@prisma/')) {
        err(
          `${relFile} imports "${spec}" — apps must not depend on the platform's ` +
            'Prisma client. Use ctx.platform / ctx.db from @veltrixsecops/app-sdk instead.',
        )
      } else if (FORBIDDEN_MODULES.has(spec)) {
        err(`security: ${relFile} imports "${spec}" — apps run in-process and must not spawn processes or evaluate code`)
      } else if (REVIEW_MODULES.has(spec) && !isTestFile) {
        warn(`security: ${relFile} imports "${spec}" — filesystem/OS access is rarely needed by an API-driven app; expect review scrutiny`)
      }
    }

    if (isTestFile) continue
    if (/\beval\s*\(/.test(source)) {
      err(`security: ${relFile} uses eval() — string evaluation is not allowed in app code`)
    }
    if (/\bnew\s+Function\s*\(/.test(source)) {
      err(`security: ${relFile} uses new Function() — string evaluation is not allowed in app code`)
    }
    if (/\bprocess\.exit\s*\(/.test(source)) {
      err(`security: ${relFile} calls process.exit() — apps run inside the platform server and must never terminate the process`)
    }
  }

  // --- Package hygiene + secret scanning ------------------------------------
  for (const file of [...codeFiles, ...textFiles]) {
    const relFile = path.relative(appDir, file)
    if (relFile === 'package-lock.json') continue
    const source = fs.readFileSync(file, 'utf8')

    if (/^<{7} /m.test(source)) {
      err(`packaging: ${relFile} contains git merge-conflict markers`)
    }
    for (const [pattern, what] of SECRET_PATTERNS) {
      if (pattern.test(source)) {
        err(`security: ${relFile} appears to contain ${what} — credential material must never ship in an app`)
      }
    }
    const isTestFile = /(^|[\\/])__tests__[\\/]/.test(relFile) || /\.test\.[a-z]+$/.test(relFile)
    if (!isTestFile && SECRET_ASSIGNMENT_RE.test(source)) {
      warn(`security: ${relFile} assigns a long literal to a secret-named key — verify it is not a real credential`)
    }
  }

  // --- SDK version freshness --------------------------------------------------
  // The client runtime contract (authFetch, host runtime shims) requires
  // @veltrixsecops/app-sdk >= 1.2.0 — older declarations typecheck against a
  // package that lacks the ./client subpath.
  const usesSdkClient = codeFiles.some((file) =>
    fs.readFileSync(file, 'utf8').includes('@veltrixsecops/app-sdk/client'),
  )
  if (usesSdkClient && fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const declared =
        pkg.devDependencies?.['@veltrixsecops/app-sdk'] ?? pkg.dependencies?.['@veltrixsecops/app-sdk']
      const minMatch = typeof declared === 'string' && declared.match(/(\d+)\.(\d+)\.\d+/)
      if (minMatch) {
        const [major, minor] = [Number(minMatch[1]), Number(minMatch[2])]
        if (major < SDK_CLIENT_MIN[0] || (major === SDK_CLIENT_MIN[0] && minor < SDK_CLIENT_MIN[1])) {
          warn(
            `packaging: app imports @veltrixsecops/app-sdk/client but declares "${declared}" — ` +
              `declare ^${SDK_CLIENT_MIN.join('.')}.0 or newer`,
          )
        }
      }
    } catch {
      // package.json parse issues are reported above
    }
  }

  // --- Client bundle dry-run ---------------------------------------------------
  // Compile-check the app's client entry with the same shim-plugin settings
  // the serving route uses — a client that cannot bundle would otherwise
  // fail (or 500) the first time a user opens one of its pages.
  if (manifest.client?.entry) {
    const entryPath = path.resolve(appDir, String(manifest.client.entry))
    const resolvedEntry =
      entryPath === appDir || entryPath.startsWith(appDir + path.sep)
        ? resolveClientEntryFile(entryPath)
        : null
    if (!resolvedEntry) {
      err(`client: client.entry "${manifest.client.entry}" did not resolve to a file`)
    } else {
      try {
        await build({
          entryPoints: [resolvedEntry],
          absWorkingDir: appDir,
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2020',
          jsx: 'automatic',
          logLevel: 'silent',
          nodePaths: [path.join(appDir, 'node_modules')],
          write: false,
          plugins: [hostShimPlugin()],
        })
      } catch (e: any) {
        err(`client: bundle check failed — ${e.message}`)
      }
    }
  }

  return { errors, warnings, manifest }
}

// --- Canvas template + defaults schema validation -----------------------------

type Reporter = (message: string) => void

/**
 * Validate a canvas.yaml template's structure and return its shape
 * (Map of section name → Set of field keys) for defaults cross-checking.
 * Returns null when the file is missing (already reported) or unparseable.
 */
function validateCanvasTemplate(
  appDir: string,
  ref: unknown,
  label: string,
  err: Reporter,
  warn: Reporter,
): Map<string, Set<string>> | null {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const file = path.join(appDir, ref)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null

  let canvas: any
  try {
    canvas = yaml.load(fs.readFileSync(file, 'utf8'))
  } catch (e: any) {
    err(`canvas: ${label} template is not valid YAML: ${e.message}`)
    return null
  }
  if (!canvas || typeof canvas !== 'object') {
    err(`canvas: ${label} template did not parse to an object`)
    return null
  }
  for (const key of ['id', 'name']) {
    if (!canvas[key]) warn(`canvas: ${label} template is missing "${key}"`)
  }
  if (!Array.isArray(canvas.sections) || canvas.sections.length === 0) {
    err(`canvas: ${label} template must declare at least one section`)
    return null
  }

  const shape = new Map<string, Set<string>>()
  canvas.sections.forEach((section: any, si: number) => {
    const sLabel = `${label} section[${si}]${section?.name ? ` ("${section.name}")` : ''}`
    if (!section?.name) err(`canvas: ${sLabel} is missing "name"`)
    if (!Array.isArray(section?.fields) || section.fields.length === 0) {
      err(`canvas: ${sLabel} declares no fields`)
      return
    }
    const keys = new Set<string>()
    section.fields.forEach((field: any, fi: number) => {
      const fLabel = `${sLabel}.fields[${fi}]${field?.key ? ` ("${field.key}")` : ''}`
      if (!field?.key) {
        err(`canvas: ${fLabel} is missing "key"`)
      } else if (keys.has(field.key)) {
        err(`canvas: ${fLabel} duplicates key "${field.key}" within its section`)
      } else {
        keys.add(field.key)
      }
      if (!field?.label) warn(`canvas: ${fLabel} is missing "label"`)
      if (!CANVAS_FIELD_TYPES.has(field?.fieldType)) {
        err(
          `canvas: ${fLabel}.fieldType must be one of ${[...CANVAS_FIELD_TYPES].join(', ')} ` +
            `(got "${field?.fieldType}")`,
        )
      }

      if (field?.fieldType === 'select') {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          err(`canvas: ${fLabel} is a select but declares no options`)
        } else {
          field.options.forEach((option: any, oi: number) => {
            if (option?.label === undefined || option?.value === undefined) {
              err(`canvas: ${fLabel}.options[${oi}] needs both "label" and "value"`)
            }
          })
          if (
            field.defaultValue !== undefined &&
            !field.options.some((o: any) => o?.value === field.defaultValue)
          ) {
            err(`canvas: ${fLabel}.defaultValue "${field.defaultValue}" is not one of its option values`)
          }
        }
      }
      if (field?.fieldType === 'number' && field.defaultValue !== undefined && typeof field.defaultValue !== 'number') {
        err(`canvas: ${fLabel}.defaultValue must be a number for a number field`)
      }
      if (field?.fieldType === 'checkbox' && field.defaultValue !== undefined && typeof field.defaultValue !== 'boolean') {
        err(`canvas: ${fLabel}.defaultValue must be a boolean for a checkbox field`)
      }

      const v = field?.validation
      if (v && typeof v === 'object') {
        if (v.pattern !== undefined) {
          try {
            new RegExp(v.pattern)
          } catch (e: any) {
            err(`canvas: ${fLabel}.validation.pattern is not a valid regex: ${e.message}`)
          }
        }
        for (const bound of ['min', 'max', 'minLength', 'maxLength']) {
          if (v[bound] !== undefined && typeof v[bound] !== 'number') {
            err(`canvas: ${fLabel}.validation.${bound} must be a number`)
          }
        }
        if (typeof v.min === 'number' && typeof v.max === 'number' && v.min > v.max) {
          err(`canvas: ${fLabel}.validation has min (${v.min}) greater than max (${v.max})`)
        }
      }
    })
    if (section?.name) shape.set(section.name, keys)
  })
  return shape
}

/** Cross-check a defaults.yaml against the canvas template's shape. */
function validateDefaultsFile(
  appDir: string,
  ref: string,
  label: string,
  canvasShape: Map<string, Set<string>>,
  err: Reporter,
  warn: Reporter,
): void {
  const file = path.join(appDir, ref)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return

  let defaults: any
  try {
    defaults = yaml.load(fs.readFileSync(file, 'utf8'))
  } catch (e: any) {
    err(`canvas: ${label} defaults file is not valid YAML: ${e.message}`)
    return
  }
  if (defaults == null) return // an empty defaults file is fine
  if (typeof defaults !== 'object' || Array.isArray(defaults)) {
    err(`canvas: ${label} defaults must be a mapping of section name → field defaults`)
    return
  }
  for (const [sectionName, fields] of Object.entries(defaults)) {
    const keys = canvasShape.get(sectionName)
    if (!keys) {
      warn(`canvas: ${label} defaults section "${sectionName}" does not match any canvas section`)
      continue
    }
    if (fields == null || typeof fields !== 'object' || Array.isArray(fields)) continue
    for (const key of Object.keys(fields)) {
      if (!keys.has(key)) {
        warn(`canvas: ${label} defaults key "${sectionName}.${key}" does not match any canvas field`)
      }
    }
  }
}

/**
 * Brand configuration for self-hosted / white-label deployments.
 *
 * Resolution order (highest wins):
 *   1. `GET /api/brand` — fetched once, lazily, the same pattern
 *      `FeatureFlagContext` uses for `GET /api/feature-flags`. Lets a
 *      self-hosted admin rebrand the running app without a rebuild.
 *   2. Build-time Vite env vars (`VITE_BRAND_*`) — bakes a rebrand into the
 *      static bundle at build time.
 *   3. The Community Edition defaults below.
 *
 * This module has no React dependency beyond the `useBrand` hook, and no
 * provider needs to wrap the app — `getBrand()` / `loadBrand()` work from
 * anywhere (including outside components), while `useBrand()` gives
 * components a live value that updates once the `/api/brand` fetch (if any)
 * resolves.
 */
import { useEffect, useState } from 'react'
import { API_URL } from './config'

export interface BrandConfig {
  /** Short product name shown in the sidebar, login page, and page titles. */
  name: string
  /** One-line descriptor shown under the name (e.g. login page, sidebar). */
  tagline: string
  /** Optional "by <vendor>" attribution line. Empty string hides it. */
  vendor: string
  /** Logo asset URL. Defaults to the bundled Community Edition mark. */
  logoUrl: string
  /** Shown in the sidebar footer / about screens. */
  version: string
  /** Support / project URL surfaced in footers and error states. */
  supportUrl: string
  /**
   * Brand accent for the browser-tab favicon and mobile/PWA chrome
   * (`theme-color`). Any CSS color — a white-label deployment sets
   * `VELTRIX_BRAND_COLOR` (or build-time `VITE_BRAND_COLOR`) to its own hex and
   * the icon follows, no file edits. Drives `applyBrandChrome`, not the CSS
   * design tokens (those are the shared component palette).
   */
  color: string
}

function env(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export const DEFAULT_BRAND: BrandConfig = {
  name: env('VITE_BRAND_NAME') ?? 'Veltrix',
  tagline: env('VITE_BRAND_TAGLINE') ?? 'Security-as-Code',
  vendor: env('VITE_BRAND_VENDOR') ?? '',
  logoUrl: env('VITE_BRAND_LOGO_URL') ?? '/assets/logo.svg',
  version: env('VITE_APP_VERSION') ?? '0.1.0',
  supportUrl: env('VITE_BRAND_SUPPORT_URL') ?? 'https://github.com/captivatortechnologies/veltrix-community',
  color: env('VITE_BRAND_COLOR') ?? '#f59e0b',
}

// A brand color is trusted deployment config, but it is interpolated into an
// inline SVG + a meta tag, so constrain it to a hex or a bare CSS keyword
// (no `url(...)`, no angle brackets) as defense-in-depth.
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/

/**
 * Point the browser-tab favicon and mobile/PWA chrome (`theme-color`) at the
 * brand accent. Called at bootstrap with the env/default color, then again once
 * `GET /api/brand` resolves — so a deployment's `VELTRIX_BRAND_COLOR` swaps the
 * icon with no file edits. Rebuilding the `<link>` as a fresh data URI also
 * sidesteps the browser's notoriously sticky favicon cache.
 */
export function applyBrandChrome(color: string): void {
  if (typeof document === 'undefined') return
  const c = SAFE_COLOR.test(color.trim()) ? color.trim() : '#f59e0b'
  // Shield mark — keep in sync with public/favicon.svg (that static file is the
  // pre-JS default; this runtime version wins the moment the app boots).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`

  let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
  if (!icon) {
    icon = document.createElement('link')
    icon.rel = 'icon'
    document.head.appendChild(icon)
  }
  icon.type = 'image/svg+xml'
  icon.href = href

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = c
}

let current: BrandConfig = { ...DEFAULT_BRAND }
let fetched = false
let inFlight: Promise<BrandConfig> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Best-effort remote brand override. Safe to call repeatedly — the actual
 * fetch only ever happens once per page load; subsequent calls resolve to
 * the cached result. Falls back silently to the current (env/default) value
 * on any error or non-OK response, so a missing `/api/brand` route never
 * breaks the UI.
 */
export function loadBrand(): Promise<BrandConfig> {
  if (fetched) return Promise.resolve(current)
  if (inFlight) return inFlight

  inFlight = fetch(`${API_URL}/brand`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: Partial<BrandConfig> | null) => {
      if (data && typeof data === 'object') {
        current = { ...DEFAULT_BRAND, ...data }
        notify()
      }
      return current
    })
    .catch(() => current)
    .finally(() => {
      fetched = true
      inFlight = null
    })

  return inFlight
}

/** Synchronous snapshot — env/defaults until `loadBrand()` resolves. */
export function getBrand(): BrandConfig {
  return current
}

/**
 * React hook returning the current brand config. Re-renders the component
 * once (if) a `/api/brand` override arrives. Does NOT itself trigger the
 * fetch — that happens once at app bootstrap (see `main.tsx`, which calls
 * `loadBrand()` alongside mounting `<App />`) so that using this hook in an
 * isolated component test never fires an unmocked network request; it only
 * ever reads the synchronous env/default snapshot unless the app root has
 * already kicked off `loadBrand()`.
 */
export function useBrand(): BrandConfig {
  const [brand, setBrand] = useState<BrandConfig>(current)

  useEffect(() => {
    const listener = () => setBrand(current)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return brand
}

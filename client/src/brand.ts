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

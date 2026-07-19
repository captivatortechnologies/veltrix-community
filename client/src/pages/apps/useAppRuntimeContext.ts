// ========================================================================
// useAppRuntimeContext — builds the AppContextValue that both AppPageHost
// (the /apps/:appId/* bundle pages) and AppConfigTypePage (the in-page
// "Defaults"/companion tabs on a configuration type) provide to app bundle
// components. Extracted so the two surfaces stay in lock-step: any app page
// rendered on either surface sees the same customer-scoped settings,
// component/credential/tag fetchers, resolved branding and app-scoped
// permission API.
// ========================================================================

import { useEffect, useMemo, useState } from 'react'
import { getCustomerId, getUser } from '../../services/authService'
import {
  authFetch,
  createAppScopedPermissionsApi,
  type AppBranding,
  type AppContextValue,
} from '../../appRuntime/installHostRuntime'
import { fetchJsonArray, fetchAllCredentials, normalizeSettings } from '../../appRuntime/appPlatformData'
import type { EnabledApp, EnabledAppBranding } from '../../services/appService'

/** Map the /enabled payload branding to the SDK context shape (resolved URLs). */
function toContextBranding(branding: EnabledAppBranding | undefined): AppBranding | null {
  if (!branding) return null
  const mapped: AppBranding = {}
  if (branding.primaryColor) mapped.primaryColor = branding.primaryColor
  if (branding.accentColor) mapped.accentColor = branding.accentColor
  if (branding.logoUrl) mapped.logo = branding.logoUrl
  if (branding.logoDarkUrl) mapped.logoDark = branding.logoDarkUrl
  return Object.keys(mapped).length > 0 ? mapped : null
}

/**
 * Build the `AppContextValue` for an enabled app: fetches its customer-scoped
 * settings (failures yield `{}`) and memoizes the context object. Returns
 * `null` until the app is resolved. Pure hook — no rendering — so it composes
 * inside any host surface.
 */
export function useAppRuntimeContext(app: EnabledApp | undefined): AppContextValue | null {
  const enabledAppId = app?.appId
  const appBranding = app?.branding
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!enabledAppId) return
    let active = true
    setSettings({})
    authFetch(`/api/apps/${enabledAppId}/settings`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: { settings?: unknown }) => {
        if (active) setSettings(normalizeSettings(json?.settings))
      })
      .catch(() => {
        if (active) setSettings({})
      })
    return () => {
      active = false
    }
  }, [enabledAppId])

  return useMemo<AppContextValue | null>(() => {
    if (!enabledAppId) return null
    const user = getUser()
    const customerId = user?.customerId || getCustomerId() || ''
    return {
      appId: enabledAppId,
      customerId,
      user,
      customer: null,
      settings,
      getComponents: () => fetchJsonArray('/api/components'),
      getCredentials: () => fetchAllCredentials(customerId),
      getTags: () => fetchJsonArray('/api/tags'),
      branding: toContextBranding(appBranding),
      permissions: createAppScopedPermissionsApi(enabledAppId),
    }
  }, [enabledAppId, settings, appBranding])
}

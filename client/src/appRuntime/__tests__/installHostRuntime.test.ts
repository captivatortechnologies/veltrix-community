/**
 * Tests: installHostRuntime — the host side of the app-client runtime
 * contract (globalThis.__VELTRIX_APP_RUNTIME__).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { renderHook } from '@testing-library/react'
import {
  installHostRuntime,
  HOST_RUNTIME_GLOBAL,
  AppContext,
  authFetch,
  useAppContext,
  useAppBranding,
  getHostRuntime,
  requireHostRuntime,
  createAppScopedPermissionsApi,
  type AppContextValue,
  type VeltrixHostRuntime,
} from '../installHostRuntime'
import { usePermissionStore, type PermissionSnapshot } from '../../stores/permissionStore'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Textarea,
  Checkbox,
  Select,
  FormField,
  Tabs,
  DataTable,
  StatsCard,
  FormDialog,
  EmptyState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  Tooltip,
  Spinner,
} from '../../components/shared'
import { useToast } from '../../components/shared/Toast'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'

function readGlobal(): VeltrixHostRuntime {
  return (globalThis as Record<string, unknown>)[HOST_RUNTIME_GLOBAL] as VeltrixHostRuntime
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  usePermissionStore.setState({ snapshot: null })
  installHostRuntime()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installHostRuntime', () => {
  it('installs the runtime global at import time with every contract key', () => {
    const runtime = readGlobal()
    expect(runtime).toBeTruthy()
    expect(Object.keys(runtime).sort()).toEqual(
      ['AppContext', 'authFetch', 'jsxRuntime', 'react', 'reactDom', 'reactDomClient', 'sdk', 'ui', 'permissions'].sort(),
    )
  })

  it('exposes the host React module objects (single React instance)', () => {
    const runtime = readGlobal()
    expect((runtime.react as typeof React).createElement).toBe(React.createElement)
    expect(runtime.reactDom).toBeTruthy()
    expect(runtime.reactDomClient).toBeTruthy()
    expect((runtime.jsxRuntime as { jsx: unknown }).jsx).toBeTypeOf('function')
  })

  it('shares the ONE AppContext object between the global and the host exports', () => {
    expect(readGlobal().AppContext).toBe(AppContext)
  })

  it('exposes the full sdk surface per the contract', () => {
    const sdk = readGlobal().sdk
    expect(sdk.AppContext).toBe(AppContext)
    expect(sdk.useAppContext).toBe(useAppContext)
    expect(sdk.useAppBranding).toBe(useAppBranding)
    expect(sdk.usePipelineStatus).toBeTypeOf('function')
    expect(sdk.authFetch).toBe(authFetch)
    expect(sdk.getHostRuntime).toBe(getHostRuntime)
    expect(sdk.requireHostRuntime).toBe(requireHostRuntime)
    expect(sdk.HOST_RUNTIME_GLOBAL).toBe('__VELTRIX_APP_RUNTIME__')
  })

  it('exposes the @veltrixsecops/app-sdk/client data helpers (app bundles externalize them here)', () => {
    const sdk = readGlobal().sdk
    // Missing any of these makes an app page fail at runtime with
    // "X is not a function" (e.g. resolveTool on the Connections page).
    const clientHelpers = [
      'resolveTool',
      'listInventory',
      'addInventoryItem',
      'updateInventoryItem',
      'removeInventoryItem',
      'listConnectivityProviders',
      'listEnvironments',
      'listCredentials',
      'createCredential',
      'updateCredential',
      'removeCredential',
    ];
    for (const name of clientHelpers) {
      expect(sdk[name]).toBeTypeOf('function');
    }
  })

  it('getHostRuntime returns the installed runtime; requireHostRuntime does not throw', () => {
    expect(getHostRuntime()).toBe(readGlobal())
    expect(requireHostRuntime()).toBe(readGlobal())
  })
})

describe('ui surface', () => {
  it('exposes the real components/shared implementations that back @veltrixsecops/app-sdk/ui', () => {
    const ui = readGlobal().ui
    expect(ui.Button).toBe(Button)
    expect(ui.Input).toBe(Input)
    expect(ui.Textarea).toBe(Textarea)
    expect(ui.Checkbox).toBe(Checkbox)
    expect(ui.Select).toBe(Select)
    expect(ui.Card).toBe(Card)
    expect(ui.CardHeader).toBe(CardHeader)
    expect(ui.CardBody).toBe(CardBody)
    expect(ui.CardFooter).toBe(CardFooter)
    expect(ui.Badge).toBe(Badge)
    expect(ui.Tooltip).toBe(Tooltip)
    expect(ui.EmptyState).toBe(EmptyState)
    expect(ui.Skeleton).toBe(Skeleton)
    expect(ui.SkeletonText).toBe(SkeletonText)
    expect(ui.SkeletonCard).toBe(SkeletonCard)
    expect(ui.DataTable).toBe(DataTable)
    expect(ui.StatsCard).toBe(StatsCard)
    expect(ui.FormDialog).toBe(FormDialog)
    expect(ui.FormField).toBe(FormField)
    expect(ui.Tabs).toBe(Tabs)
    expect(ui.Spinner).toBe(Spinner)
  })

  it('exposes the useToast and useConfirmDialog hooks whose providers AppShell mounts', () => {
    const ui = readGlobal().ui
    expect(ui.useToast).toBe(useToast)
    expect(ui.useConfirmDialog).toBe(useConfirmDialog)
  })

  it('includes every name in the documented ui contract', () => {
    const ui = readGlobal().ui
    const expected = [
      'Button', 'Input', 'Textarea', 'Checkbox', 'Select',
      'Card', 'CardHeader', 'CardBody', 'CardFooter',
      'Badge', 'Tooltip', 'EmptyState',
      'Skeleton', 'SkeletonText', 'SkeletonCard',
      'DataTable', 'StatsCard', 'FormDialog', 'Tabs', 'Spinner',
      'useToast', 'useConfirmDialog',
    ]
    for (const name of expected) {
      // Components may be forwardRef objects or function components, and the two
      // hooks are functions — so assert presence rather than a specific typeof.
      expect(ui[name], `ui.${name} must be present`).toBeDefined()
      expect(ui[name], `ui.${name} must not be null`).not.toBeNull()
    }
    expect(ui.useToast).toBeTypeOf('function')
    expect(ui.useConfirmDialog).toBeTypeOf('function')
  })
})

describe('authFetch', () => {
  it('attaches Authorization from the localStorage token', async () => {
    localStorage.setItem('token', 'test-token-123')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/apps/enabled')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]
    expect(input).toBe('/api/apps/enabled')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token-123')
  })

  it('merges caller-provided headers with the auth header', async () => {
    localStorage.setItem('token', 'tok')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.method).toBe('POST')
  })

  it('sends no Authorization header when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/x')

    const [, init] = fetchMock.mock.calls[0]
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })
})

describe('useAppContext', () => {
  it('throws the contract error message outside a provider', () => {
    expect(() => renderHook(() => useAppContext())).toThrow(
      'useAppContext must be used within an AppContextProvider',
    )
  })

  it('returns the provided context value inside a provider', () => {
    const value: AppContextValue = {
      appId: 'test-app',
      customerId: 'cust-1',
      user: null,
      customer: null,
      settings: { retention: 30 },
      getComponents: async () => [],
      getCredentials: async () => [],
      getTags: async () => [],
      permissions: { has: () => false, list: () => [] },
    }
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AppContext.Provider, { value }, children)

    const { result } = renderHook(() => useAppContext(), { wrapper })
    expect(result.current.appId).toBe('test-app')
    expect(result.current.settings).toEqual({ retention: 30 })
  })
})

describe('useAppBranding', () => {
  const baseValue: AppContextValue = {
    appId: 'test-app',
    customerId: 'cust-1',
    user: null,
    customer: null,
    settings: {},
    getComponents: async () => [],
    getCredentials: async () => [],
    getTags: async () => [],
    permissions: { has: () => false, list: () => [] },
  }

  function wrapperWith(value: AppContextValue) {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(AppContext.Provider, { value }, children)
  }

  it('returns the context branding (resolved URLs) when present', () => {
    const branding = {
      primaryColor: '#FC0000',
      logo: '/api/apps/test-app/branding/logo',
    }
    const { result } = renderHook(() => useAppBranding(), {
      wrapper: wrapperWith({ ...baseValue, branding }),
    })
    expect(result.current).toEqual(branding)
  })

  it('returns null when the context declares no branding', () => {
    const { result } = renderHook(() => useAppBranding(), {
      wrapper: wrapperWith(baseValue),
    })
    expect(result.current).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// permissions (Wave C4) — the host runtime + AppContext permission surface
// ---------------------------------------------------------------------------

const scopedSnapshot: PermissionSnapshot = {
  permissions: [
    { resource: 'tool', action: 'read', appId: null },
    { resource: 'indexes', action: 'write', appId: 'test-app' },
  ],
  wildcards: { allAll: false, resources: [] },
  isPlatformAdmin: false,
}

describe('runtime.permissions (platform-scoped, no appId default)', () => {
  it('has()/list() read through to the C1 permission store', () => {
    usePermissionStore.getState().setSnapshot(scopedSnapshot)
    const runtime = readGlobal()

    expect(runtime.permissions.has('tool', 'read')).toBe(true)
    expect(runtime.permissions.has('tool', 'write')).toBe(false)
    expect(runtime.permissions.list()).toEqual(scopedSnapshot.permissions)
  })

  it('is fail-closed for anything not explicitly granted', () => {
    const runtime = readGlobal()
    expect(runtime.permissions.has('tool', 'read')).toBe(false)
    expect(runtime.permissions.list()).toEqual([])
  })

  it('does NOT default opts.appId — an app-scoped grant requires an explicit appId', () => {
    usePermissionStore.getState().setSnapshot(scopedSnapshot)
    const runtime = readGlobal()

    expect(runtime.permissions.has('indexes', 'write')).toBe(false)
    expect(runtime.permissions.has('indexes', 'write', { appId: 'test-app' })).toBe(true)
  })

  it('platform-admin / all:all snapshots grant everything', () => {
    usePermissionStore.getState().setSnapshot({
      permissions: [],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: true,
    })
    expect(readGlobal().permissions.has('anything', 'whatever')).toBe(true)
  })
})

describe('createAppScopedPermissionsApi (used to build AppContextValue.permissions)', () => {
  it('defaults opts.appId to the given app id when has() is called without one', () => {
    usePermissionStore.getState().setSnapshot(scopedSnapshot)
    const permissions = createAppScopedPermissionsApi('test-app')

    expect(permissions.has('indexes', 'write')).toBe(true)
    expect(permissions.list()).toEqual(scopedSnapshot.permissions)
  })

  it('an explicit opts.appId overrides the default (checking a different app or the platform)', () => {
    usePermissionStore.getState().setSnapshot(scopedSnapshot)
    const permissions = createAppScopedPermissionsApi('test-app')

    expect(permissions.has('indexes', 'write', { appId: 'other-app' })).toBe(false)
    // A platform-scoped row still satisfies an app-scoped check by default (design decision 2).
    expect(permissions.has('tool', 'read')).toBe(true)
    // Explicit platform check (appId: null) also resolves correctly.
    expect(permissions.has('tool', 'read', { appId: null })).toBe(true)
  })

  it('is fail-closed before any snapshot has loaded', () => {
    const permissions = createAppScopedPermissionsApi('test-app')
    expect(permissions.has('indexes', 'write')).toBe(false)
  })
})

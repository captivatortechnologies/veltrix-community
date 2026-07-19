import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createPreviewAuthFetch,
  installPreviewAuthFetchGuard,
  SANDBOX_WRITE_BLOCKED_MESSAGE,
} from '../previewBundle'
import { getHostRuntime } from '../../../appRuntime/installHostRuntime'

// Fully mock the host runtime module (not importActual) so these tests exercise
// createPreviewAuthFetch/installPreviewAuthFetchGuard against a runtime object
// we fully control and can assert against, independent of the real
// globalThis.__VELTRIX_APP_RUNTIME__ side effect installHostRuntime.ts performs
// at import time.
const originalAuthFetch = vi.fn(async () => new Response('ok'))

vi.mock('../../../appRuntime/installHostRuntime', () => {
  const runtime = {
    react: {},
    reactDom: {},
    reactDomClient: {},
    jsxRuntime: {},
    AppContext: { Provider: () => null },
    authFetch: undefined as unknown,
    sdk: { authFetch: undefined as unknown },
  }
  return {
    HOST_RUNTIME_GLOBAL: '__VELTRIX_APP_RUNTIME__',
    installHostRuntime: vi.fn(() => runtime),
    getHostRuntime: vi.fn(() => runtime),
    authFetch: (...args: unknown[]) => (globalThis as any).__previewBundleTestOriginalAuthFetch(...args),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).__previewBundleTestOriginalAuthFetch = originalAuthFetch
  const runtime = getHostRuntime() as unknown as { authFetch: unknown; sdk: { authFetch: unknown } }
  runtime.authFetch = originalAuthFetch
  runtime.sdk.authFetch = originalAuthFetch
})

const APP_ID = 'fictional-app'

describe('createPreviewAuthFetch', () => {
  it('passes READS of the app\'s own routes through to the real authFetch (so the preview populates)', async () => {
    const onBlocked = vi.fn()
    const wrapped = createPreviewAuthFetch(APP_ID, onBlocked)

    await wrapped(`/api/apps/${APP_ID}/widgets`) // default GET
    expect(originalAuthFetch).toHaveBeenCalledWith(`/api/apps/${APP_ID}/widgets`, undefined)
    expect(onBlocked).not.toHaveBeenCalled()

    await wrapped(`/api/apps/${APP_ID}/widgets`, { method: 'HEAD' })
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('intercepts WRITES to the app\'s own routes (not saved) and reports the path', async () => {
    const onBlocked = vi.fn()
    const wrapped = createPreviewAuthFetch(APP_ID, onBlocked)

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await expect(wrapped(`/api/apps/${APP_ID}/widgets`, { method })).rejects.toThrow(
        SANDBOX_WRITE_BLOCKED_MESSAGE,
      )
    }
    expect(onBlocked).toHaveBeenCalledWith(`/api/apps/${APP_ID}/widgets`)
    expect(originalAuthFetch).not.toHaveBeenCalled()
  })

  it('intercepts a write to the bare app-root path and its absolute-URL form', async () => {
    const wrapped = createPreviewAuthFetch(APP_ID, vi.fn())
    await expect(wrapped(`/api/apps/${APP_ID}`, { method: 'POST' })).rejects.toThrow(
      SANDBOX_WRITE_BLOCKED_MESSAGE,
    )
    await expect(
      wrapped(`http://localhost:5000/api/apps/${APP_ID}/widgets`, { method: 'DELETE' }),
    ).rejects.toThrow(SANDBOX_WRITE_BLOCKED_MESSAGE)
  })

  it('does NOT intercept a write to a different app id that merely shares a prefix', async () => {
    const wrapped = createPreviewAuthFetch(APP_ID, vi.fn())
    const init = { method: 'POST' }
    await wrapped(`/api/apps/${APP_ID}ish-other-app/widgets`, init)
    expect(originalAuthFetch).toHaveBeenCalledWith(`/api/apps/${APP_ID}ish-other-app/widgets`, init)
  })

  it('passes writes to platform APIs straight through to the real authFetch', async () => {
    const wrapped = createPreviewAuthFetch(APP_ID, vi.fn())
    const init = { method: 'POST' }
    await wrapped('/api/components', init)
    expect(originalAuthFetch).toHaveBeenCalledWith('/api/components', init)
  })
})

describe('installPreviewAuthFetchGuard', () => {
  it('overrides the shared runtime authFetch (both top-level and sdk) while installed, and restores it on cleanup', async () => {
    const runtime = getHostRuntime() as unknown as { authFetch: unknown; sdk: { authFetch: unknown } }
    const onBlocked = vi.fn()

    const restore = installPreviewAuthFetchGuard(APP_ID, onBlocked)
    expect(runtime.authFetch).not.toBe(originalAuthFetch)
    expect(runtime.sdk.authFetch).not.toBe(originalAuthFetch)

    // Simulate the sandboxed bundle WRITING to its own server route via the SDK shim.
    await expect(
      (runtime.sdk.authFetch as typeof originalAuthFetch)(`/api/apps/${APP_ID}/widgets`, { method: 'POST' }),
    ).rejects.toThrow(SANDBOX_WRITE_BLOCKED_MESSAGE)
    expect(onBlocked).toHaveBeenCalledWith(`/api/apps/${APP_ID}/widgets`)

    restore()
    expect(runtime.authFetch).toBe(originalAuthFetch)
    expect(runtime.sdk.authFetch).toBe(originalAuthFetch)
  })

  it('is a no-op when the host runtime is not installed', () => {
    vi.mocked(getHostRuntime).mockReturnValueOnce(null as never)
    expect(() => installPreviewAuthFetchGuard(APP_ID, vi.fn())()).not.toThrow()
  })
})

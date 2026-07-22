// ========================================================================
// AppBundleTab — renders a single app-bundle page component as an in-page
// tab body (used by AppConfigTypePage for a configuration type's companion
// "Defaults"/tab pages, i.e. manifest pages with `nav: 'tab'` +
// `parent: '/config/<typeId>'`). It loads the app's client bundle, provides
// the same AppContext the standalone AppPageHost provides, and guards the
// render with a Suspense boundary and an error boundary with retry.
// ========================================================================

import React, { Suspense, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppContext } from '../../appRuntime/installHostRuntime'
import type { EnabledApp } from '../../services/appService'
import type { AppPageDeclaration } from '../../../../shared/types/app'
import { loadAppClientBundle, type AppClientBundleModule } from './AppPageHost'
import { useAppRuntimeContext } from './useAppRuntimeContext'

const CenteredSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-24" role="status" aria-label={label}>
    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{label}</p>
  </div>
)

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mx-auto mt-16 max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">{children}</div>
  </div>
)

interface ErrorBoundaryProps {
  appId: string
  onRetry: () => void
  children: React.ReactNode
}

class TabErrorBoundary extends React.Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <Panel title="This tab crashed">
          <p className="break-words">
            {`"${this.props.appId}" hit an error while rendering: ${this.state.error.message}`}
          </p>
          <button
            type="button"
            className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => {
              this.setState({ error: null })
              this.props.onRetry()
            }}
          >
            Retry
          </button>
        </Panel>
      )
    }
    return this.props.children
  }
}

export interface AppBundleTabProps {
  app: EnabledApp
  page: AppPageDeclaration
  /** Injectable bundle loader (tests); defaults to the real dynamic import. */
  loadBundle?: (appId: string, version?: string) => Promise<AppClientBundleModule>
}

/**
 * Load the app bundle and render `page.component`, wrapped in the shared
 * AppContext, a Suspense boundary and an error boundary. Mirrors AppPageHost's
 * body resolution but for a single, known page rendered inside another surface.
 */
export const AppBundleTab: React.FC<AppBundleTabProps> = ({
  app,
  page,
  loadBundle = loadAppClientBundle,
}) => {
  const [bundle, setBundle] = useState<AppClientBundleModule | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)
  const contextValue = useAppRuntimeContext(app)

  useEffect(() => {
    let active = true
    setBundle(null)
    setLoadError(null)
    loadBundle(app.appId, app.version).then(
      (mod) => {
        if (active) setBundle(mod)
      },
      (err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err : new Error(String(err)))
      },
    )
    return () => {
      active = false
    }
  }, [app.appId, app.version, attempt, loadBundle])

  if (!contextValue) return <CenteredSpinner label={`Loading ${app.name}…`} />

  if (loadError) {
    return (
      <Panel title="Failed to load app">
        <p className="break-words">
          {`The client bundle for "${app.name}" could not be loaded: ${loadError.message}`}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </button>
      </Panel>
    )
  }

  if (!bundle) return <CenteredSpinner label={`Loading ${page.label}…`} />

  const PageComponent = bundle.pages?.[page.component]
  if (!PageComponent) {
    return (
      <Panel title="Tab unavailable">
        <p>
          {`The "${app.name}" bundle does not export a "${page.component}" component. ` +
            'The app package may be out of date — try reinstalling the app.'}
        </p>
      </Panel>
    )
  }

  return (
    <AppContext.Provider value={contextValue}>
      <TabErrorBoundary
        key={`${app.appId}:${page.path}:${attempt}`}
        appId={app.appId}
        onRetry={() => setAttempt((n) => n + 1)}
      >
        <Suspense fallback={<CenteredSpinner label={`Loading ${page.label}…`} />}>
          <PageComponent />
        </Suspense>
      </TabErrorBoundary>
    </AppContext.Provider>
  )
}

export default AppBundleTab

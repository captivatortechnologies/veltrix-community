import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/shared/Button'

export interface PreviewErrorBoundaryProps {
  /** Label for the crashing view, shown in the error message (e.g. the page's own label). */
  pageLabel: string
  onReload: () => void
  children: React.ReactNode
}

interface PreviewErrorBoundaryState {
  error: Error | null
}

/**
 * Isolates a mounted sandbox page's render tree from the rest of the portal.
 * A work-in-progress app page is expected to throw sometimes — that must
 * never take down the SandboxDetailPage around it (mirrors
 * AppPageHost.AppPageErrorBoundary for installed apps, with an explicit
 * "Reload" action since sandbox pages change on every save).
 */
export class PreviewErrorBoundary extends React.Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  override state: PreviewErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PreviewErrorBoundaryState {
    return { error }
  }

  override render() {
    const { error } = this.state
    if (error) {
      return (
        <div
          role="alert"
          className="rounded-md border border-danger-subtle bg-danger-subtle p-6 text-center"
        >
          <AlertTriangle size={28} className="mx-auto text-danger" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-content-primary">
            {`"${this.props.pageLabel}" crashed while rendering`}
          </h3>
          <p className="mt-1 text-sm text-danger-subtle-foreground break-words">{error.message}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            leftIcon={<RotateCcw size={14} aria-hidden="true" />}
            onClick={() => {
              this.setState({ error: null })
              this.props.onReload()
            }}
          >
            Reload
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

export default PreviewErrorBoundary

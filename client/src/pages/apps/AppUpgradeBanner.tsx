// ========================================================================
// AppUpgradeBanner — the generic, per-tenant "an upgrade is available" banner
// shown at the top of every app surface (Overview and the app's other bundle
// pages) by AppPageHost.
//
// It is ZERO app-specific: it reads GET /api/apps/:appId/version for the signed-
// in tenant, and when the tenant's installed version is behind the latest
// published version it renders a banner. Clicking "Review & upgrade" opens a
// modal that shows the release notes (markdown) for the user to read; confirming
// calls POST /api/apps/:appId/upgrade, which pulls + installs the latest version
// for THIS tenant only, then refreshes the version + the enabled-apps header.
//
// When the tenant is already on the latest version, nothing renders (there is
// nothing to act on) — the current version is already shown in the app header.
// ========================================================================

import React, { useCallback, useEffect, useState } from 'react'
import { ArrowUpCircle, Sparkles } from 'lucide-react'
import type { EnabledApp } from '../../services/appService'
import { appService, type AppVersionInfo } from '../../services/appService'
import { useApps } from '../../contexts/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useToast } from '../../components/shared/Toast'
import { Modal } from '../../components/shared/Modal'
import { Button } from '../../components/shared/Button'
import { ReleaseNotes } from './ReleaseNotes'

export interface AppUpgradeBannerProps {
  app: EnabledApp
  /** Injectable fetchers (tests); default to the real appService. */
  fetchVersion?: (appId: string) => Promise<AppVersionInfo>
  upgrade?: (appId: string) => Promise<{ upgraded: boolean; toVersion: string; message?: string }>
}

export const AppUpgradeBanner: React.FC<AppUpgradeBannerProps> = ({
  app,
  fetchVersion = appService.getAppVersion,
  upgrade = appService.upgradeApp,
}) => {
  const { refreshApps } = useApps()
  const { hasPermission } = usePermissions()
  const toast = useToast()

  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

  // `apps:write` is the same platform permission the upgrade route enforces —
  // hide the action entirely for a user who could not perform it anyway.
  const canUpgrade = hasPermission('apps', 'write')

  const load = useCallback(
    (appId: string) => {
      let active = true
      fetchVersion(appId)
        .then((data) => {
          if (active) setInfo(data)
        })
        .catch(() => {
          if (active) setInfo(null)
        })
      return () => {
        active = false
      }
    },
    [fetchVersion],
  )

  useEffect(() => load(app.appId), [app.appId, load])

  const handleConfirm = useCallback(async () => {
    setUpgrading(true)
    try {
      const result = await upgrade(app.appId)
      if (result.upgraded) {
        toast.success(`${app.name} upgraded to v${result.toVersion}`)
      } else {
        toast.success(result.message || `${app.name} is already up to date`)
      }
      setModalOpen(false)
      // Refresh both the per-tenant version status (hides the banner) and the
      // enabled-apps list (updates the version shown in the app header).
      load(app.appId)
      await refreshApps()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upgrade failed')
    } finally {
      setUpgrading(false)
    }
  }, [app.appId, app.name, upgrade, toast, load, refreshApps])

  if (!info || !info.upgradeAvailable || !canUpgrade) {
    return null
  }

  return (
    <>
      <div
        role="status"
        className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-3"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content-primary">
            A new version of {app.name} is available
          </p>
          <p className="text-xs text-content-secondary">
            You're on v{info.installedVersion} · Latest release v{info.latestVersion}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<ArrowUpCircle size={16} aria-hidden="true" />}
          onClick={() => setModalOpen(true)}
        >
          Review &amp; upgrade
        </Button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => (upgrading ? undefined : setModalOpen(false))}
        title={`Upgrade ${app.name} to v${info.latestVersion}`}
        subtitle={`You're currently on v${info.installedVersion}. Review the release notes before upgrading.`}
        size="lg"
        disableBackdropClose={upgrading}
        disableEscapeClose={upgrading}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={upgrading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={upgrading}
              loadingText="Upgrading…"
              leftIcon={<ArrowUpCircle size={16} aria-hidden="true" />}
            >
              Upgrade to v{info.latestVersion}
            </Button>
          </>
        }
      >
        <ReleaseNotes markdown={info.releaseNotes} />
      </Modal>
    </>
  )
}

export default AppUpgradeBanner

// ========================================================================
// Sandbox Formatting Helpers
//
// Shared between SandboxesPage (list) and SandboxDetailPage — kept in one
// place so status labels/colors and the relative-expiry/file-summary
// copy stay consistent across both views (DRY).
// ========================================================================

import type { BadgeVariant } from '../../components/shared/Badge'
import type { SandboxStatus } from '../../services/sandboxApi'

export const STATUS_BADGES: Record<SandboxStatus, BadgeVariant> = {
  ACTIVE: 'success',
  SYNCING: 'info',
  ERROR: 'danger',
  EXPIRED: 'default',
}

export const STATUS_LABELS: Record<SandboxStatus, string> = {
  ACTIVE: 'Active',
  SYNCING: 'Syncing',
  ERROR: 'Error',
  EXPIRED: 'Expired',
}

export const STATUS_DESCRIPTIONS: Record<SandboxStatus, string> = {
  ACTIVE: 'Ready — the CLI can sync files and run the dev loop against this sandbox.',
  SYNCING: 'The CLI is currently syncing local files into this sandbox.',
  ERROR: 'The last sync or dev session failed. Check the CLI output for details.',
  EXPIRED: 'This sandbox has expired and no longer accepts syncs. Delete it and create a new one.',
}

/** File/size summary for a sandbox. Avoids the "0 · 0 B" reading of two independently
 * formatted zeros by collapsing the empty case into a single honest sentence. */
export function formatFilesSummary(fileCount: number, sizeBytes: number): string {
  if (fileCount === 0) return 'No files synced yet'
  return `${fileCount.toLocaleString()} file${fileCount === 1 ? '' : 's'} · ${formatSize(sizeBytes)}`
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * Relative expiry label, e.g. "Expires in 7 days" / "Expired 3 hours ago". Unlike
 * `formatRelativeTime` (which only ever describes the past, e.g. audit-log timestamps),
 * `expiresAt` is usually in the future, so the direction of the sentence has to flip.
 */
export function formatRelativeExpiry(expiresAt: string): { label: string; isExpired: boolean } {
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  const isExpired = diffMs <= 0
  const absMs = Math.abs(diffMs)

  let amount: string
  if (absMs < MINUTE_MS) {
    amount = 'less than a minute'
  } else if (absMs < HOUR_MS) {
    const mins = Math.round(absMs / MINUTE_MS)
    amount = `${mins} minute${mins === 1 ? '' : 's'}`
  } else if (absMs < DAY_MS) {
    const hrs = Math.round(absMs / HOUR_MS)
    amount = `${hrs} hour${hrs === 1 ? '' : 's'}`
  } else {
    const days = Math.round(absMs / DAY_MS)
    amount = `${days} day${days === 1 ? '' : 's'}`
  }

  return { label: isExpired ? `Expired ${amount} ago` : `Expires in ${amount}`, isExpired }
}

/** The CLI dev-loop command for a specific sandbox. `<your-app-dir>` stays a literal
 * placeholder — the local directory is inherently unknowable server-side — but the
 * sandbox name is filled in since we already have it. */
export function buildDevCommand(sandboxName: string): string {
  return `veltrix dev <your-app-dir> --sandbox ${sandboxName}`
}

export const CLI_SNIPPET = [
  'veltrix login',
  'veltrix sandbox create my-sandbox --app <app-id>',
  'veltrix dev ./my-app --sandbox my-sandbox',
].join('\n')

/** Short (first 12 hex chars) sha256 for a readable file listing — full hash stays in the title tooltip. */
export function shortSha(sha256: string): string {
  return sha256.slice(0, 12)
}

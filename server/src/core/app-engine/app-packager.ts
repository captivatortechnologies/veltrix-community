// ========================================================================
// App Packager
//
// Handles extraction and validation of uploaded app packages.
// Supports .zip and .tar.gz/.tar archive formats.
//
// Security enforced:
//   - Path traversal prevention (no ".." in entry paths)
//   - Executable file type rejection (.sh, .bat, .exe, .cmd, .ps1)
//   - Maximum package size of 50 MB
//   - manifest.yaml must exist at the root level of the archive
//   - App ID must match /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import type { AppManifest } from '../../../../shared/types/app'
import { parseManifest } from './manifest-parser'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_PACKAGE_SIZE = 50 * 1024 * 1024 // 50 MB

/** File extensions never allowed inside app/sandbox archives. */
export const BLOCKED_EXTENSIONS = new Set(['.sh', '.bat', '.exe', '.cmd', '.ps1'])

const APP_ID_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PackageFormat = 'zip' | 'tar' | 'tar.gz'

export interface PackageValidationResult {
  manifest: AppManifest
  format: PackageFormat
  fileCount: number
  totalSize: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine the archive format from the filename extension.
 * Throws if the extension is not a recognised package format.
 */
export function getPackageFormat(filename: string): PackageFormat {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tar.gz'
  }
  if (lower.endsWith('.tar')) {
    return 'tar'
  }
  if (lower.endsWith('.zip')) {
    return 'zip'
  }

  throw new Error(
    `Unsupported package format for "${filename}". ` +
    `Accepted formats: .zip, .tar, .tar.gz, .tgz`,
  )
}

/**
 * Validate an uploaded package buffer WITHOUT extracting it to disk.
 *
 * Reads manifest.yaml from the archive, parses it, and enforces all
 * security rules. Returns the validation result on success or throws
 * a descriptive error on failure.
 */
export async function validatePackageBuffer(
  buffer: Buffer,
  filename: string,
): Promise<PackageValidationResult> {
  enforceMaxSize(buffer, filename)

  const format = getPackageFormat(filename)

  if (format === 'zip') {
    return validateZipBuffer(buffer, format)
  }

  return validateTarBuffer(buffer, filename, format)
}

/**
 * Extract an uploaded package buffer to targetDir.
 *
 * Performs the same security checks as validatePackageBuffer before
 * writing any files. Returns the parsed manifest on success.
 */
export async function extractPackage(
  buffer: Buffer,
  filename: string,
  targetDir: string,
): Promise<AppManifest> {
  enforceMaxSize(buffer, filename)

  const format = getPackageFormat(filename)

  if (format === 'zip') {
    return extractZip(buffer, targetDir)
  }

  return extractTar(buffer, filename, targetDir, format)
}

// ---------------------------------------------------------------------------
// Zip implementation
// ---------------------------------------------------------------------------

function validateZipBuffer(buffer: Buffer, format: PackageFormat): PackageValidationResult {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  validateZipEntries(entries)

  const manifestEntry = entries.find((e) => e.entryName === 'manifest.yaml')
  if (!manifestEntry) {
    throw new Error('Invalid package: manifest.yaml not found at the root level of the archive')
  }

  const manifest = parseManifestFromBuffer(manifestEntry.getData(), 'manifest.yaml')
  validateAppId(manifest.id)

  const fileCount = entries.filter((e) => !e.isDirectory).length
  const totalSize = entries.reduce((sum, e) => sum + e.header.size, 0)

  return { manifest, format, fileCount, totalSize }
}

function extractZip(buffer: Buffer, targetDir: string): AppManifest {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  validateZipEntries(entries)

  const manifestEntry = entries.find((e) => e.entryName === 'manifest.yaml')
  if (!manifestEntry) {
    throw new Error('Invalid package: manifest.yaml not found at the root level of the archive')
  }

  const manifest = parseManifestFromBuffer(manifestEntry.getData(), 'manifest.yaml')
  validateAppId(manifest.id)

  fs.mkdirSync(targetDir, { recursive: true })
  zip.extractAllTo(targetDir, /* overwrite */ true)

  return manifest
}

function validateZipEntries(entries: AdmZip.IZipEntry[]): void {
  for (const entry of entries) {
    assertSafePath(entry.entryName)
    assertNotExecutable(entry.entryName)
  }
}

// ---------------------------------------------------------------------------
// Tar / tar.gz implementation
// ---------------------------------------------------------------------------

async function validateTarBuffer(
  buffer: Buffer,
  filename: string,
  format: PackageFormat,
): Promise<PackageValidationResult> {
  const tmpFile = writeTempFile(buffer, filename)

  try {
    const entries: Array<{ path: string; size: number; isDir: boolean }> = []

    await tar.list({
      file: tmpFile,
      onReadEntry: (entry) => {
        entries.push({
          path: entry.path,
          size: entry.size ?? 0,
          isDir: entry.type === 'Directory',
        })
      },
    })

    for (const entry of entries) {
      assertSafePath(entry.path)
      assertNotExecutable(entry.path)
    }

    // manifest.yaml must exist at root (no directory prefix)
    const hasManifest = entries.some(
      (e) => !e.isDir && normaliseEntryPath(e.path) === 'manifest.yaml',
    )
    if (!hasManifest) {
      throw new Error('Invalid package: manifest.yaml not found at the root level of the archive')
    }

    // Extract manifest content to a temp file so parseManifest can read it
    const manifestTmp = path.join(os.tmpdir(), `veltrix-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`)

    await tar.extract({
      file: tmpFile,
      cwd: path.dirname(manifestTmp),
      filter: (entryPath) => normaliseEntryPath(entryPath) === 'manifest.yaml',
      strip: computeStripDepth(entries, 'manifest.yaml'),
    })

    // After strip+filter the file lands as "manifest.yaml" in cwd
    const extractedManifestPath = path.join(path.dirname(manifestTmp), 'manifest.yaml')

    let manifest: AppManifest
    try {
      manifest = parseManifest(extractedManifestPath)
    } finally {
      safeUnlink(extractedManifestPath)
    }

    validateAppId(manifest.id)

    const fileCount = entries.filter((e) => !e.isDir).length
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0)

    return { manifest, format, fileCount, totalSize }
  } finally {
    safeUnlink(tmpFile)
  }
}

async function extractTar(
  buffer: Buffer,
  filename: string,
  targetDir: string,
  format: PackageFormat,
): Promise<AppManifest> {
  const tmpFile = writeTempFile(buffer, filename)

  try {
    // First pass: collect entries for validation
    const entries: Array<{ path: string; size: number; isDir: boolean }> = []

    await tar.list({
      file: tmpFile,
      onReadEntry: (entry) => {
        entries.push({
          path: entry.path,
          size: entry.size ?? 0,
          isDir: entry.type === 'Directory',
        })
      },
    })

    for (const entry of entries) {
      assertSafePath(entry.path)
      assertNotExecutable(entry.path)
    }

    const hasManifest = entries.some(
      (e) => !e.isDir && normaliseEntryPath(e.path) === 'manifest.yaml',
    )
    if (!hasManifest) {
      throw new Error('Invalid package: manifest.yaml not found at the root level of the archive')
    }

    const stripDepth = computeStripDepth(entries, 'manifest.yaml')

    fs.mkdirSync(targetDir, { recursive: true })

    // Second pass: extract
    await tar.extract({
      file: tmpFile,
      cwd: targetDir,
      strip: stripDepth,
    })

    const manifest = parseManifest(path.join(targetDir, 'manifest.yaml'))
    validateAppId(manifest.id)

    return manifest
  } finally {
    safeUnlink(tmpFile)
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Write buffer to a temporary file and return its path.
 * Caller is responsible for deleting the file when done.
 */
function writeTempFile(buffer: Buffer, originalFilename: string): string {
  const ext = originalFilename.toLowerCase().endsWith('.tar.gz') ? '.tar.gz' : path.extname(originalFilename)
  const tmpPath = path.join(
    os.tmpdir(),
    `veltrix-pkg-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  )
  fs.writeFileSync(tmpPath, buffer)
  return tmpPath
}

/**
 * Parse a manifest YAML from a raw Buffer.
 * Writes to a temp file, calls parseManifest, then cleans up.
 */
function parseManifestFromBuffer(data: Buffer, label: string): AppManifest {
  const tmpPath = path.join(
    os.tmpdir(),
    `veltrix-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
  )
  fs.writeFileSync(tmpPath, data)
  try {
    return parseManifest(tmpPath)
  } finally {
    safeUnlink(tmpPath)
  }
}

/**
 * Normalise a tar entry path to a posix-style relative path.
 * Strips any leading "./" or single directory prefix when a top-level
 * wrapper folder is present (handled separately via strip depth).
 */
function normaliseEntryPath(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

/**
 * Compute the number of path components to strip so that manifest.yaml
 * lands at the root of the target directory.
 *
 * If the archive has a single top-level directory (e.g. "my-app-1.0/"),
 * strip=1 is returned. If manifest.yaml is already at the root, strip=0.
 */
function computeStripDepth(
  entries: Array<{ path: string; isDir: boolean }>,
  targetFile: string,
): number {
  for (const entry of entries) {
    const normalised = normaliseEntryPath(entry.path)
    if (normalised === targetFile) {
      return 0
    }
    const parts = normalised.split('/')
    if (parts.length === 2 && parts[1] === targetFile) {
      return 1
    }
  }
  return 0
}

/**
 * Throw if the buffer exceeds the maximum allowed package size.
 */
function enforceMaxSize(buffer: Buffer, filename: string): void {
  if (buffer.byteLength > MAX_PACKAGE_SIZE) {
    const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1)
    throw new Error(
      `Package "${filename}" is too large (${sizeMb} MB). ` +
      `Maximum allowed size is ${MAX_PACKAGE_SIZE / (1024 * 1024)} MB.`,
    )
  }
}

/**
 * Throw if the given path contains a ".." component (path traversal attack).
 * Exported so other ingest paths (e.g. sandbox sync) enforce identical rules.
 */
export function assertSafePath(entryPath: string): void {
  const normalised = entryPath.replace(/\\/g, '/')
  if (normalised.split('/').some((part) => part === '..')) {
    throw new Error(
      `Security violation: path traversal detected in archive entry "${entryPath}"`,
    )
  }
}

/**
 * Throw if the given path has a blocked executable extension.
 * Exported so other ingest paths (e.g. sandbox sync) enforce identical rules.
 */
export function assertNotExecutable(entryPath: string): void {
  const ext = path.extname(entryPath).toLowerCase()
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Security violation: executable file type "${ext}" is not permitted in app packages (entry: "${entryPath}")`,
    )
  }
}

/**
 * Validate that the app ID matches the required slug format.
 */
function validateAppId(appId: string): void {
  if (!APP_ID_REGEX.test(appId)) {
    throw new Error(
      `Invalid app ID "${appId}": must match /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ ` +
      `(lowercase alphanumeric and hyphens, no leading/trailing hyphens)`,
    )
  }
}

/**
 * Delete a file without throwing if it does not exist or the delete fails.
 */
function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Ignore – temp-file cleanup is best-effort
  }
}

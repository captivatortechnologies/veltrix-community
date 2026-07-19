// ========================================================================
// App Downloader
//
// Downloads app packages from remote URLs with streaming size enforcement.
// Integrates with the existing retry utility for resilience and
// url-validator for SSRF prevention.
// ========================================================================

import axios from 'axios'
import type { AxiosResponse } from 'axios'
import { Readable } from 'stream'
import { MAX_PACKAGE_SIZE } from './app-packager'
import { validateDownloadUrl, MAX_DOWNLOAD_REDIRECTS } from './url-validator'
import { retry } from '../../utils/retry'
import { loggerService } from '../../module/logger/logger.service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOWNLOAD_TIMEOUT_MS = 60_000

const ACCEPTED_CONTENT_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-tgz',
  'application/octet-stream',
])

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadResult {
  buffer: Buffer
  filename: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download an app package from a remote URL.
 *
 * Flow:
 * 1. Validates the URL (SSRF prevention, scheme, extension)
 * 2. Streams the response with a byte counter that aborts at 50 MB
 * 3. Infers the filename from Content-Disposition or URL path
 * 4. Retries on network errors / 5xx (max 2 retries)
 *
 * Returns the downloaded buffer and inferred filename.
 * Throws on validation failure, download error, or size limit exceeded.
 */
export async function downloadAppPackage(url: string): Promise<DownloadResult> {
  // Validate URL before downloading
  const { sanitizedUrl } = await validateDownloadUrl(url)

  // Wrap the download in retry for resilience
  return retry(
    () => performDownload(sanitizedUrl),
    {
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      onRetry: (error, attempt) => {
        loggerService.warn(`[AppDownloader] Retry attempt ${attempt} for ${sanitizedUrl}`, {
          error: error instanceof Error ? error.message : String(error),
        })
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function performDownload(url: string): Promise<DownloadResult> {
  let response: AxiosResponse<Readable>

  try {
    response = await axios.get<Readable>(url, {
      responseType: 'stream',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxRedirects: MAX_DOWNLOAD_REDIRECTS,
      headers: {
        'User-Agent': 'Veltrix-AppInstaller/1.0',
        Accept: 'application/zip, application/gzip, application/x-tar, application/octet-stream',
      },
    })
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `Download failed with HTTP ${error.response.status}: ${error.response.statusText || 'Unknown error'}`,
      )
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000} seconds`)
    }
    throw new Error(`Download failed: ${error.message}`)
  }

  // Validate Content-Type (lenient — allow missing or octet-stream)
  const contentType = response.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()
  if (contentType && !ACCEPTED_CONTENT_TYPES.has(contentType)) {
    response.data.destroy()
    throw new Error(
      `Unexpected Content-Type "${contentType}". Expected a package file (zip, tar, gzip, or octet-stream).`,
    )
  }

  // Stream with size enforcement
  const chunks: Buffer[] = []
  let totalBytes = 0

  try {
    for await (const chunk of response.data) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buf.byteLength

      if (totalBytes > MAX_PACKAGE_SIZE) {
        response.data.destroy()
        throw new Error(
          `Download exceeds maximum allowed size (${MAX_PACKAGE_SIZE / (1024 * 1024)} MB). Download aborted.`,
        )
      }

      chunks.push(buf)
    }
  } catch (error: any) {
    // Re-throw size limit errors as-is
    if (error.message?.includes('maximum allowed size')) throw error
    throw new Error(`Download stream error: ${error.message}`)
  }

  if (totalBytes === 0) {
    throw new Error('Downloaded file is empty (0 bytes)')
  }

  const buffer = Buffer.concat(chunks)
  const filename = inferFilename(url, response.headers)

  loggerService.info(`[AppDownloader] Downloaded ${(totalBytes / 1024).toFixed(1)} KB from ${url}`)

  return { buffer, filename }
}

/**
 * Infer a filename from the response headers or URL path.
 *
 * Priority:
 * 1. Content-Disposition header (filename=...)
 * 2. Last segment of the URL path
 * 3. Fallback: "package.zip"
 */
function inferFilename(url: string, headers: Record<string, any>): string {
  // Try Content-Disposition header
  const disposition = headers['content-disposition']
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";\s]+)"?/i)
    if (match?.[1]) {
      return decodeURIComponent(match[1])
    }
  }

  // Fall back to URL path
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last && /\.(zip|tar|tar\.gz|tgz)$/i.test(last)) {
      return decodeURIComponent(last)
    }
  } catch {
    // Ignore URL parsing errors
  }

  return 'package.zip'
}

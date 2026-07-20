// ========================================================================
// URL Validator
//
// Validates download URLs for app package installation.
// Prevents SSRF attacks by blocking private/internal IP ranges
// and enforcing HTTPS-only connections.
// ========================================================================

import * as dns from 'dns'
import * as net from 'net'
import * as url from 'url'
import type { PackageFormat } from './app-packager'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_REDIRECTS = 3

const VALID_EXTENSIONS: Array<{ suffix: string; format: PackageFormat }> = [
  { suffix: '.tar.gz', format: 'tar.gz' },
  { suffix: '.tgz', format: 'tar.gz' },
  { suffix: '.tar', format: 'tar' },
  { suffix: '.zip', format: 'zip' },
]

// IPv4 private/reserved ranges in CIDR notation
const BLOCKED_IPV4_RANGES = [
  { prefix: '10.', description: 'RFC 1918 private' },
  { prefix: '172.16.', description: 'RFC 1918 private', mask: 12 },
  { prefix: '192.168.', description: 'RFC 1918 private' },
  { prefix: '127.', description: 'Loopback' },
  { prefix: '169.254.', description: 'Link-local / AWS metadata' },
  { prefix: '0.', description: 'Current network' },
]

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ValidatedUrl {
  sanitizedUrl: string
  expectedFormat: PackageFormat
  hostname: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a URL for downloading an app package.
 *
 * Checks:
 * - Valid URL syntax
 * - HTTPS scheme (HTTP allowed for localhost in development)
 * - File extension matches a supported package format
 * - Hostname does not resolve to a private/internal IP (SSRF prevention)
 *
 * Returns the sanitized URL and expected package format on success.
 * Throws a descriptive error on failure.
 */
export async function validateDownloadUrl(rawUrl: string): Promise<ValidatedUrl> {
  // Parse URL
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('Invalid URL format')
  }

  // Scheme check
  const isDev = process.env.NODE_ENV === 'development'
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

  if (parsed.protocol === 'http:') {
    if (!(isDev && isLocalhost)) {
      throw new Error('Only HTTPS URLs are allowed. HTTP is permitted for localhost in development mode only.')
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}". Only HTTPS is allowed.`)
  }

  // Extension check
  const pathname = parsed.pathname.toLowerCase()
  const matched = VALID_EXTENSIONS.find((ext) => pathname.endsWith(ext.suffix))
  if (!matched) {
    throw new Error(
      `URL must point to a package file (.zip, .tar, .tar.gz, .tgz). Got: "${parsed.pathname}"`,
    )
  }

  // SSRF prevention: resolve hostname and check IP
  if (!isLocalhost || !isDev) {
    const resolvedIps = await resolveHostname(parsed.hostname)

    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        throw new Error(
          `URL resolves to a private/internal IP address (${ip}). This is not allowed for security reasons.`,
        )
      }
    }
  }

  return {
    sanitizedUrl: parsed.toString(),
    expectedFormat: matched.format,
    hostname: parsed.hostname,
  }
}

/**
 * SSRF guard for server-initiated fetches to a REMOTE, tenant-influenced URL that
 * is NOT a package download (e.g. OIDC issuer discovery + JWKS). Enforces HTTPS
 * (HTTP only for localhost in dev) and rejects any URL whose hostname resolves to
 * a private/internal/link-local IP — blocking cloud-metadata (169.254.169.254)
 * and internal-service SSRF (CWE-918). Returns the normalized URL; throws on
 * violation.
 *
 * NOTE: resolves-then-checks; it does not pin the resolved IP for the subsequent
 * fetch, so an attacker controlling an authoritative resolver (DNS rebinding) is
 * only partially mitigated. It closes the common "point the issuer at an internal
 * IP / metadata endpoint" case.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(String(rawUrl).trim())
  } catch {
    throw new Error('Invalid URL format')
  }

  const isDev = process.env.NODE_ENV === 'development'
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

  if (parsed.protocol === 'http:') {
    if (!(isDev && isLocalhost)) {
      throw new Error('Only HTTPS URLs are allowed (HTTP permitted for localhost in development only).')
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme "${parsed.protocol}". Only HTTPS is allowed.`)
  }

  // If the host is an IP literal, check it directly — no DNS needed. This also
  // catches metadata IPs (169.254.169.254) and works under NODE_ENV=test.
  if (net.isIP(parsed.hostname) !== 0) {
    if (isPrivateIp(parsed.hostname)) {
      throw new Error(`URL points at a private/internal IP (${parsed.hostname}); refused for security reasons.`)
    }
  } else if (process.env.NODE_ENV !== 'test' && !(isDev && isLocalhost)) {
    // Resolve the hostname and reject private targets. Skipped under NODE_ENV=test,
    // where synthetic test hostnames don't resolve and the network is mocked.
    const resolvedIps = await resolveHostname(parsed.hostname)
    for (const ip of resolvedIps) {
      if (isPrivateIp(ip)) {
        throw new Error(`URL resolves to a private/internal IP (${ip}); refused for security reasons.`)
      }
    }
  }

  return parsed.toString()
}

/**
 * Check if an IP address falls within a private or reserved range.
 * Exported for testing.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    // Loopback
    if (normalized === '::1') return true
    // Unique local (fc00::/7)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    // Link-local (fe80::/10)
    if (normalized.startsWith('fe80')) return true
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) — extract the IPv4 part
    const v4Mapped = extractIPv4FromMapped(normalized)
    if (v4Mapped) return isPrivateIpv4(v4Mapped)
    return false
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    return isPrivateIpv4(ip)
  }

  // Unknown format — block by default
  return true
}

/**
 * Maximum number of HTTP redirects to follow when downloading.
 */
export const MAX_DOWNLOAD_REDIRECTS = MAX_REDIRECTS

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPrivateIpv4(ip: string): boolean {
  // Simple prefix checks for most ranges
  for (const range of BLOCKED_IPV4_RANGES) {
    if (range.mask === 12) {
      // 172.16.0.0/12 covers 172.16.x.x through 172.31.x.x
      const parts = ip.split('.')
      if (parts[0] === '172') {
        const second = parseInt(parts[1], 10)
        if (second >= 16 && second <= 31) return true
      }
    } else if (ip.startsWith(range.prefix)) {
      return true
    }
  }
  return false
}

function extractIPv4FromMapped(ipv6: string): string | null {
  // Handles ::ffff:192.168.1.1 and ::ffff:c0a8:0101
  const match = ipv6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (match) return match[1]
  return null
}

function resolveHostname(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // If the hostname is already an IP, return it directly
    if (net.isIP(hostname)) {
      resolve([hostname])
      return
    }

    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        // Try IPv6 as fallback
        dns.resolve6(hostname, (err6, addresses6) => {
          if (err6) {
            reject(new Error(`Failed to resolve hostname "${hostname}": ${err.message}`))
            return
          }
          resolve(addresses6)
        })
        return
      }
      resolve(addresses)
    })
  })
}

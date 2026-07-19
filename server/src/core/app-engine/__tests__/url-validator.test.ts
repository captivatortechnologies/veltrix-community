// ========================================================================
// Tests: url-validator.ts
//
// Covers:
//   - isPrivateIp          – IPv4 private/reserved ranges, public IPs,
//                            IPv6 loopback/unique-local/link-local,
//                            IPv6 public, IPv4-mapped IPv6, unknown format
//   - validateDownloadUrl  – valid HTTPS URLs for each extension,
//                            HTTP rejected in production, HTTP allowed for
//                            localhost in development, invalid URL format,
//                            unsupported scheme, missing/invalid extension,
//                            SSRF rejection when DNS resolves to private IP,
//                            DNS resolution failure, IPv6 DNS fallback
//   - MAX_DOWNLOAD_REDIRECTS – exported constant value
// ========================================================================

import * as dns from 'dns'
import { validateDownloadUrl, isPrivateIp, MAX_DOWNLOAD_REDIRECTS } from '../url-validator'

// ---------------------------------------------------------------------------
// Mock dns module
//
// resolveHostname() calls dns.resolve4 and, on failure, dns.resolve6.
// We replace both with jest.fn() so tests control what IPs get returned
// without making real network calls.
// ---------------------------------------------------------------------------

jest.mock('dns', () => ({
  resolve4: jest.fn(),
  resolve6: jest.fn(),
}))

const mockResolve4 = dns.resolve4 as jest.Mock
const mockResolve6 = dns.resolve6 as jest.Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make dns.resolve4 succeed and return the given IPv4 addresses.
 */
function mockDnsResolve4Success(addresses: string[]): void {
  mockResolve4.mockImplementation((_hostname, callback) => {
    // @ts-expect-error – overload signature mismatch; callback style is correct
    callback(null, addresses)
  })
}

/**
 * Make dns.resolve4 fail with the given error, then make dns.resolve6 succeed
 * with the given IPv6 addresses.
 */
function mockDnsResolve4FailThenResolve6Success(resolve6Addresses: string[]): void {
  mockResolve4.mockImplementation((_hostname, callback) => {
    // @ts-expect-error – callback style
    callback(new Error('ENODATA'))
  })
  mockResolve6.mockImplementation((_hostname, callback) => {
    // @ts-expect-error – callback style
    callback(null, resolve6Addresses)
  })
}

/**
 * Make both dns.resolve4 and dns.resolve6 fail.
 */
function mockDnsBothFail(resolve4Message = 'ENOTFOUND'): void {
  mockResolve4.mockImplementation((_hostname, callback) => {
    // @ts-expect-error – callback style
    callback(new Error(resolve4Message))
  })
  mockResolve6.mockImplementation((_hostname, callback) => {
    // @ts-expect-error – callback style
    callback(new Error('ENOTFOUND'))
  })
}

// ---------------------------------------------------------------------------
// NODE_ENV management
//
// Tests that exercise development-mode behaviour mutate process.env.NODE_ENV.
// We save and restore the original value around each such test.
// ---------------------------------------------------------------------------

function withNodeEnv(env: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = env
    try {
      await fn()
    } finally {
      process.env.NODE_ENV = original
    }
  }
}

// ============================================================================
// isPrivateIp
// ============================================================================

describe('isPrivateIp', () => {
  // -------------------------------------------------------------------------
  // IPv4 – private / reserved ranges
  // -------------------------------------------------------------------------

  describe('IPv4 private ranges return true', () => {
    describe('10.0.0.0/8 (RFC 1918)', () => {
      it('returns true for 10.0.0.1', () => {
        expect(isPrivateIp('10.0.0.1')).toBe(true)
      })

      it('returns true for 10.255.255.255 (upper boundary)', () => {
        expect(isPrivateIp('10.255.255.255')).toBe(true)
      })

      it('returns true for 10.10.10.10', () => {
        expect(isPrivateIp('10.10.10.10')).toBe(true)
      })
    })

    describe('172.16.0.0/12 (RFC 1918)', () => {
      it('returns true for 172.16.0.1 (lower boundary)', () => {
        expect(isPrivateIp('172.16.0.1')).toBe(true)
      })

      it('returns true for 172.31.255.255 (upper boundary)', () => {
        expect(isPrivateIp('172.31.255.255')).toBe(true)
      })

      it('returns true for 172.20.1.1 (mid-range)', () => {
        expect(isPrivateIp('172.20.1.1')).toBe(true)
      })

      it('returns false for 172.15.255.255 (just below range)', () => {
        // 172.15 is NOT in the 172.16–172.31 block
        expect(isPrivateIp('172.15.255.255')).toBe(false)
      })

      it('returns false for 172.32.0.0 (just above range)', () => {
        expect(isPrivateIp('172.32.0.0')).toBe(false)
      })
    })

    describe('192.168.0.0/16 (RFC 1918)', () => {
      it('returns true for 192.168.0.1', () => {
        expect(isPrivateIp('192.168.0.1')).toBe(true)
      })

      it('returns true for 192.168.255.255', () => {
        expect(isPrivateIp('192.168.255.255')).toBe(true)
      })

      it('returns true for 192.168.1.100', () => {
        expect(isPrivateIp('192.168.1.100')).toBe(true)
      })
    })

    describe('127.0.0.0/8 (Loopback)', () => {
      it('returns true for 127.0.0.1', () => {
        expect(isPrivateIp('127.0.0.1')).toBe(true)
      })

      it('returns true for 127.255.255.255', () => {
        expect(isPrivateIp('127.255.255.255')).toBe(true)
      })

      it('returns true for 127.0.0.0', () => {
        expect(isPrivateIp('127.0.0.0')).toBe(true)
      })
    })

    describe('169.254.0.0/16 (Link-local / AWS metadata)', () => {
      it('returns true for 169.254.0.1', () => {
        expect(isPrivateIp('169.254.0.1')).toBe(true)
      })

      it('returns true for 169.254.169.254 (AWS metadata endpoint)', () => {
        expect(isPrivateIp('169.254.169.254')).toBe(true)
      })

      it('returns true for 169.254.255.255', () => {
        expect(isPrivateIp('169.254.255.255')).toBe(true)
      })
    })

    describe('0.0.0.0/8 (Current network)', () => {
      it('returns true for 0.0.0.0', () => {
        expect(isPrivateIp('0.0.0.0')).toBe(true)
      })

      it('returns true for 0.255.255.255', () => {
        expect(isPrivateIp('0.255.255.255')).toBe(true)
      })
    })
  })

  // -------------------------------------------------------------------------
  // IPv4 – public addresses return false
  // -------------------------------------------------------------------------

  describe('IPv4 public addresses return false', () => {
    it('returns false for 8.8.8.8 (Google DNS)', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false)
    })

    it('returns false for 1.1.1.1 (Cloudflare DNS)', () => {
      expect(isPrivateIp('1.1.1.1')).toBe(false)
    })

    it('returns false for 104.16.0.0', () => {
      expect(isPrivateIp('104.16.0.0')).toBe(false)
    })

    it('returns false for 203.0.113.1', () => {
      expect(isPrivateIp('203.0.113.1')).toBe(false)
    })

    it('returns false for 192.0.2.1 (TEST-NET-1 – public range)', () => {
      // 192.0.2.x is not in any BLOCKED_IPV4_RANGES entry
      expect(isPrivateIp('192.0.2.1')).toBe(false)
    })

    it('returns false for 192.167.255.255 (just below 192.168)', () => {
      expect(isPrivateIp('192.167.255.255')).toBe(false)
    })

    it('returns false for 11.0.0.1 (just above 10.x)', () => {
      expect(isPrivateIp('11.0.0.1')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // IPv6 – private / reserved
  // -------------------------------------------------------------------------

  describe('IPv6 private / reserved addresses return true', () => {
    it('returns true for ::1 (loopback)', () => {
      expect(isPrivateIp('::1')).toBe(true)
    })

    it('returns true for FC00:: (unique local, fc prefix)', () => {
      expect(isPrivateIp('fc00::')).toBe(true)
    })

    it('returns true for FC00::1 (unique local, fc prefix variant)', () => {
      expect(isPrivateIp('fc00::1')).toBe(true)
    })

    it('returns true for FD00:: (unique local, fd prefix)', () => {
      expect(isPrivateIp('fd00::')).toBe(true)
    })

    it('returns true for fd12:3456:789a:1::1 (unique local, fd prefix)', () => {
      expect(isPrivateIp('fd12:3456:789a:1::1')).toBe(true)
    })

    it('returns true for FE80:: (link-local)', () => {
      expect(isPrivateIp('FE80::')).toBe(true)
    })

    it('returns true for fe80::1 (link-local, lowercase)', () => {
      expect(isPrivateIp('fe80::1')).toBe(true)
    })

    it('returns true for fe80::1%eth0 style (starts with fe80)', () => {
      // Even with interface suffix, startsWith check covers it
      expect(isPrivateIp('fe80::abcd:ef01')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // IPv6 – public addresses return false
  // -------------------------------------------------------------------------

  describe('IPv6 public addresses return false', () => {
    it('returns false for 2001:db8::1 (documentation range)', () => {
      expect(isPrivateIp('2001:db8::1')).toBe(false)
    })

    it('returns false for 2606:4700::1 (Cloudflare)', () => {
      expect(isPrivateIp('2606:4700::1')).toBe(false)
    })

    it('returns false for 2001:4860:4860::8888 (Google DNS IPv6)', () => {
      expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
    })

    it('returns false for :: (all-zeros – not a private range in the implementation)', () => {
      // :: is the unspecified address; the implementation does not block it as a named prefix
      expect(isPrivateIp('::')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // IPv4-mapped IPv6 addresses
  // -------------------------------------------------------------------------

  describe('IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)', () => {
    it('returns true for ::ffff:192.168.1.1 (maps to private IPv4)', () => {
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true)
    })

    it('returns true for ::ffff:10.0.0.1 (maps to private IPv4)', () => {
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
    })

    it('returns true for ::ffff:127.0.0.1 (maps to loopback IPv4)', () => {
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    })

    it('returns false for ::ffff:8.8.8.8 (maps to public IPv4)', () => {
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)
    })

    it('returns false for ::ffff:1.1.1.1 (maps to public IPv4)', () => {
      expect(isPrivateIp('::ffff:1.1.1.1')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Unknown / non-IP format – blocked by default
  // -------------------------------------------------------------------------

  describe('unknown format returns true (blocked by default)', () => {
    it('returns true for an empty string', () => {
      expect(isPrivateIp('')).toBe(true)
    })

    it('returns true for a hostname string', () => {
      expect(isPrivateIp('example.com')).toBe(true)
    })

    it('returns true for a random non-IP string', () => {
      expect(isPrivateIp('not-an-ip')).toBe(true)
    })

    it('returns true for a malformed IP-like string', () => {
      expect(isPrivateIp('999.999.999.999')).toBe(true)
    })
  })
})

// ============================================================================
// validateDownloadUrl
// ============================================================================

describe('validateDownloadUrl', () => {
  // Reset mocks before each test to prevent cross-test interference
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Valid HTTPS URLs – happy path for each supported extension
  // -------------------------------------------------------------------------

  describe('valid HTTPS URLs with supported extensions', () => {
    it('accepts a .zip URL and returns format "zip"', async () => {
      // Arrange
      mockDnsResolve4Success(['93.184.216.34'])

      // Act
      const result = await validateDownloadUrl('https://example.com/package.zip')

      // Assert
      expect(result.expectedFormat).toBe('zip')
      expect(result.sanitizedUrl).toBe('https://example.com/package.zip')
      expect(result.hostname).toBe('example.com')
    })

    it('accepts a .tar URL and returns format "tar"', async () => {
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://example.com/package.tar')

      expect(result.expectedFormat).toBe('tar')
      expect(result.hostname).toBe('example.com')
    })

    it('accepts a .tar.gz URL and returns format "tar.gz"', async () => {
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://example.com/release/app-1.0.tar.gz')

      expect(result.expectedFormat).toBe('tar.gz')
      expect(result.hostname).toBe('example.com')
    })

    it('accepts a .tgz URL and returns format "tar.gz"', async () => {
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://example.com/app.tgz')

      expect(result.expectedFormat).toBe('tar.gz')
    })

    it('trims leading/trailing whitespace from the raw URL before parsing', async () => {
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('  https://example.com/app.zip  ')

      expect(result.sanitizedUrl).toBe('https://example.com/app.zip')
    })

    it('performs case-insensitive extension matching on the pathname', async () => {
      // Pathname ".ZIP" (uppercase) should still match
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://example.com/APP.ZIP')

      expect(result.expectedFormat).toBe('zip')
    })

    it('returns the correct hostname for a URL with a subdomain', async () => {
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://releases.example.com/v2/app.tar.gz')

      expect(result.hostname).toBe('releases.example.com')
    })

    it('returns the sanitized URL as produced by the WHATWG URL parser', async () => {
      // URL with query string – should be preserved in sanitizedUrl
      mockDnsResolve4Success(['93.184.216.34'])

      const result = await validateDownloadUrl('https://example.com/app.zip?token=abc')

      expect(result.sanitizedUrl).toContain('example.com')
      expect(result.sanitizedUrl).toContain('app.zip')
    })
  })

  // -------------------------------------------------------------------------
  // HTTP scheme handling
  // -------------------------------------------------------------------------

  describe('HTTP scheme enforcement', () => {
    it('rejects http:// in production (NODE_ENV=production)', async () => {
      await withNodeEnv('production', async () => {
        await expect(
          validateDownloadUrl('http://example.com/app.zip'),
        ).rejects.toThrow('Only HTTPS URLs are allowed')
      })()
    })

    it('rejects http:// when NODE_ENV is not set', async () => {
      await withNodeEnv('', async () => {
        await expect(
          validateDownloadUrl('http://example.com/app.zip'),
        ).rejects.toThrow('Only HTTPS URLs are allowed')
      })()
    })

    it('rejects http:// for a non-localhost hostname even in development', async () => {
      await withNodeEnv('development', async () => {
        await expect(
          validateDownloadUrl('http://example.com/app.zip'),
        ).rejects.toThrow('Only HTTPS URLs are allowed')
      })()
    })

    it('allows http://localhost in development mode', async () => {
      // In dev+localhost the SSRF check is also skipped so no dns mock needed
      await withNodeEnv('development', async () => {
        const result = await validateDownloadUrl('http://localhost/app.zip')
        expect(result.sanitizedUrl).toContain('localhost')
        expect(result.expectedFormat).toBe('zip')
      })()
    })

    it('allows http://127.0.0.1 in development mode', async () => {
      await withNodeEnv('development', async () => {
        const result = await validateDownloadUrl('http://127.0.0.1/app.zip')
        expect(result.hostname).toBe('127.0.0.1')
        expect(result.expectedFormat).toBe('zip')
      })()
    })

    it('rejects http://localhost in production mode', async () => {
      await withNodeEnv('production', async () => {
        await expect(
          validateDownloadUrl('http://localhost/app.zip'),
        ).rejects.toThrow('Only HTTPS URLs are allowed')
      })()
    })
  })

  // -------------------------------------------------------------------------
  // Unsupported / invalid schemes
  // -------------------------------------------------------------------------

  describe('unsupported URL schemes', () => {
    it('rejects ftp:// with an unsupported scheme error', async () => {
      await expect(
        validateDownloadUrl('ftp://example.com/app.zip'),
      ).rejects.toThrow(/Unsupported URL scheme "ftp:"/)
    })

    it('rejects file:// with an unsupported scheme error', async () => {
      await expect(
        validateDownloadUrl('file:///etc/passwd'),
      ).rejects.toThrow(/Unsupported URL scheme "file:"/)
    })

    it('rejects javascript:// with an unsupported scheme error', async () => {
      await expect(
        validateDownloadUrl('javascript://example.com/app.zip'),
      ).rejects.toThrow(/Unsupported URL scheme/)
    })

    it('includes the actual scheme in the error message', async () => {
      await expect(
        validateDownloadUrl('ftp://example.com/app.zip'),
      ).rejects.toThrow('"ftp:"')
    })
  })

  // -------------------------------------------------------------------------
  // Invalid URL format
  // -------------------------------------------------------------------------

  describe('invalid URL format', () => {
    it('throws "Invalid URL format" for a plain string', async () => {
      await expect(validateDownloadUrl('not-a-url')).rejects.toThrow('Invalid URL format')
    })

    it('throws "Invalid URL format" for an empty string', async () => {
      await expect(validateDownloadUrl('')).rejects.toThrow('Invalid URL format')
    })

    it('throws "Invalid URL format" for whitespace only', async () => {
      await expect(validateDownloadUrl('   ')).rejects.toThrow('Invalid URL format')
    })

    it('throws "Invalid URL format" for a URL without a scheme', async () => {
      await expect(validateDownloadUrl('example.com/app.zip')).rejects.toThrow('Invalid URL format')
    })

    it('throws "Invalid URL format" for a malformed URL', async () => {
      await expect(validateDownloadUrl('https://')).rejects.toThrow('Invalid URL format')
    })
  })

  // -------------------------------------------------------------------------
  // Invalid / missing file extension
  // -------------------------------------------------------------------------

  describe('unsupported or missing file extension', () => {
    it('rejects a URL with no file extension', async () => {
      await expect(
        validateDownloadUrl('https://example.com/package'),
      ).rejects.toThrow(/URL must point to a package file/)
    })

    it('rejects a URL pointing to a .rar file', async () => {
      await expect(
        validateDownloadUrl('https://example.com/package.rar'),
      ).rejects.toThrow(/URL must point to a package file/)
    })

    it('rejects a URL pointing to a .gz file (not .tar.gz)', async () => {
      await expect(
        validateDownloadUrl('https://example.com/package.gz'),
      ).rejects.toThrow(/URL must point to a package file/)
    })

    it('rejects a URL pointing to a .exe file', async () => {
      await expect(
        validateDownloadUrl('https://example.com/setup.exe'),
      ).rejects.toThrow(/URL must point to a package file/)
    })

    it('rejects a URL pointing to a .tar.bz2 file', async () => {
      await expect(
        validateDownloadUrl('https://example.com/app.tar.bz2'),
      ).rejects.toThrow(/URL must point to a package file/)
    })

    it('includes the original pathname in the error message', async () => {
      await expect(
        validateDownloadUrl('https://example.com/evil.exe'),
      ).rejects.toThrow('/evil.exe')
    })

    it('rejects a URL ending in a path with no extension (trailing slash)', async () => {
      await expect(
        validateDownloadUrl('https://example.com/downloads/'),
      ).rejects.toThrow(/URL must point to a package file/)
    })
  })

  // -------------------------------------------------------------------------
  // SSRF prevention – DNS resolution to private IPs
  // -------------------------------------------------------------------------

  describe('SSRF prevention – private IP rejection', () => {
    it('rejects when dns.resolve4 returns a private 10.x address', async () => {
      // Arrange
      mockDnsResolve4Success(['10.0.0.1'])

      // Act & Assert
      await expect(
        validateDownloadUrl('https://internal.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('rejects when dns.resolve4 returns a 192.168.x address', async () => {
      mockDnsResolve4Success(['192.168.1.1'])

      await expect(
        validateDownloadUrl('https://internal.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('rejects when dns.resolve4 returns a loopback address (127.x)', async () => {
      mockDnsResolve4Success(['127.0.0.1'])

      await expect(
        validateDownloadUrl('https://internal.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('rejects when dns.resolve4 returns a link-local address (169.254.x)', async () => {
      mockDnsResolve4Success(['169.254.169.254'])

      await expect(
        validateDownloadUrl('https://metadata.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('includes the offending IP address in the error message', async () => {
      mockDnsResolve4Success(['10.20.30.40'])

      await expect(
        validateDownloadUrl('https://internal.example.com/app.zip'),
      ).rejects.toThrow('10.20.30.40')
    })

    it('rejects when any one of multiple resolved IPs is private', async () => {
      // First IP is public, second is private – must still reject
      mockDnsResolve4Success(['93.184.216.34', '10.0.0.1'])

      await expect(
        validateDownloadUrl('https://mixed.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('accepts when all resolved IPs are public', async () => {
      // Arrange
      mockDnsResolve4Success(['93.184.216.34'])

      // Act
      const result = await validateDownloadUrl('https://example.com/app.zip')

      // Assert – no error thrown
      expect(result.expectedFormat).toBe('zip')
    })

    it('rejects when the IPv6 fallback returns a private address', async () => {
      // resolve4 fails, resolve6 returns a private address
      mockDnsResolve4FailThenResolve6Success(['fd00::1'])

      await expect(
        validateDownloadUrl('https://ipv6only.example.com/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)
    })

    it('accepts when the IPv6 fallback returns a public address', async () => {
      mockDnsResolve4FailThenResolve6Success(['2606:4700::6810:84e5'])

      const result = await validateDownloadUrl('https://ipv6only.example.com/app.zip')

      expect(result.hostname).toBe('ipv6only.example.com')
    })

    it('skips DNS check when hostname is an inline public IPv4 address', async () => {
      // net.isIP('93.184.216.34') is truthy, so resolveHostname resolves immediately
      // without calling dns.resolve4 – no mock needed
      const result = await validateDownloadUrl('https://93.184.216.34/app.zip')

      expect(result.hostname).toBe('93.184.216.34')
      expect(mockResolve4).not.toHaveBeenCalled()
    })

    it('rejects when hostname is an inline private IPv4 address', async () => {
      // resolveHostname returns the IP directly; no DNS call made
      await expect(
        validateDownloadUrl('https://192.168.1.1/app.zip'),
      ).rejects.toThrow(/private\/internal IP address/)

      expect(mockResolve4).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // DNS resolution failure
  // -------------------------------------------------------------------------

  describe('DNS resolution failure', () => {
    it('throws when both dns.resolve4 and dns.resolve6 fail', async () => {
      mockDnsBothFail('ENOTFOUND')

      await expect(
        validateDownloadUrl('https://nonexistent.example.com/app.zip'),
      ).rejects.toThrow(/Failed to resolve hostname/)
    })

    it('includes the hostname in the DNS failure error message', async () => {
      mockDnsBothFail('ENOTFOUND')

      await expect(
        validateDownloadUrl('https://nonexistent.example.com/app.zip'),
      ).rejects.toThrow('nonexistent.example.com')
    })

    it('includes the underlying resolve4 error message in the DNS failure error', async () => {
      mockDnsBothFail('ENODATA')

      await expect(
        validateDownloadUrl('https://nonexistent.example.com/app.zip'),
      ).rejects.toThrow('ENODATA')
    })
  })

  // -------------------------------------------------------------------------
  // SSRF check skipped for localhost in development
  // -------------------------------------------------------------------------

  describe('SSRF check bypassed for localhost in development mode', () => {
    it('does not call dns.resolve4 for localhost in development', async () => {
      await withNodeEnv('development', async () => {
        await validateDownloadUrl('https://localhost/app.zip')
        expect(mockResolve4).not.toHaveBeenCalled()
      })()
    })

    it('does not call dns.resolve4 for 127.0.0.1 in development', async () => {
      await withNodeEnv('development', async () => {
        await validateDownloadUrl('https://127.0.0.1/app.zip')
        expect(mockResolve4).not.toHaveBeenCalled()
      })()
    })

    it('calls dns.resolve4 for localhost in production (SSRF check active)', async () => {
      await withNodeEnv('production', async () => {
        // localhost resolves to 127.0.0.1 which is private – rejection expected
        mockDnsResolve4Success(['127.0.0.1'])

        await expect(
          validateDownloadUrl('https://localhost/app.zip'),
        ).rejects.toThrow(/private\/internal IP address/)

        expect(mockResolve4).toHaveBeenCalledWith('localhost', expect.any(Function))
      })()
    })
  })
})

// ============================================================================
// MAX_DOWNLOAD_REDIRECTS constant
// ============================================================================

describe('MAX_DOWNLOAD_REDIRECTS', () => {
  it('equals 3', () => {
    expect(MAX_DOWNLOAD_REDIRECTS).toBe(3)
  })

  it('is a number', () => {
    expect(typeof MAX_DOWNLOAD_REDIRECTS).toBe('number')
  })
})

// ========================================================================
// Tests: app-downloader.ts
// ========================================================================

import { Readable } from 'stream'
import { MAX_PACKAGE_SIZE } from '../app-packager'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}))

jest.mock('../url-validator', () => ({
  validateDownloadUrl: jest.fn(),
  MAX_DOWNLOAD_REDIRECTS: 3,
}))

jest.mock('../../../utils/retry', () => ({
  retry: jest.fn((fn: () => Promise<any>) => fn()),
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import axios from 'axios'
import { validateDownloadUrl } from '../url-validator'
import { downloadAppPackage } from '../app-downloader'

const mockedAxiosGet = axios.get as jest.Mock
const mockedValidate = validateDownloadUrl as jest.Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SANITIZED_URL = 'https://cdn.example.com/releases/my-app.zip'

function createReadableStream(chunks: Buffer[]): Readable {
  let index = 0
  return new Readable({
    read() {
      if (index < chunks.length) {
        this.push(chunks[index++])
      } else {
        this.push(null)
      }
    },
  })
}

function mockSuccessResponse(
  chunks: Buffer[],
  headers: Record<string, string> = {},
) {
  const stream = createReadableStream(chunks)
  mockedAxiosGet.mockResolvedValue({
    data: stream,
    headers: { 'content-type': 'application/zip', ...headers },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('downloadAppPackage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedValidate.mockResolvedValue({
      sanitizedUrl: SANITIZED_URL,
      expectedFormat: 'zip',
      hostname: 'cdn.example.com',
    })
  })

  // ---- Successful download ----

  describe('successful download', () => {
    it('returns the downloaded buffer', async () => {
      const data = Buffer.from('PK\x03\x04fake-zip-data')
      mockSuccessResponse([data])

      const result = await downloadAppPackage('https://cdn.example.com/releases/my-app.zip')

      expect(result.buffer).toEqual(data)
    })

    it('assembles multiple chunks into one buffer', async () => {
      const chunk1 = Buffer.from('chunk-1-')
      const chunk2 = Buffer.from('chunk-2-')
      const chunk3 = Buffer.from('chunk-3')
      mockSuccessResponse([chunk1, chunk2, chunk3])

      const result = await downloadAppPackage(SANITIZED_URL)

      expect(result.buffer.toString()).toBe('chunk-1-chunk-2-chunk-3')
    })

    it('calls validateDownloadUrl before downloading', async () => {
      mockSuccessResponse([Buffer.from('data')])

      await downloadAppPackage('https://example.com/app.zip')

      expect(mockedValidate).toHaveBeenCalledWith('https://example.com/app.zip')
    })

    it('passes correct options to axios.get', async () => {
      mockSuccessResponse([Buffer.from('data')])

      await downloadAppPackage(SANITIZED_URL)

      expect(mockedAxiosGet).toHaveBeenCalledWith(
        SANITIZED_URL,
        expect.objectContaining({
          responseType: 'stream',
          timeout: 60000,
          maxRedirects: 3,
        }),
      )
    })
  })

  // ---- Filename inference ----

  describe('filename inference', () => {
    it('uses Content-Disposition header when available', async () => {
      mockSuccessResponse([Buffer.from('data')], {
        'content-disposition': 'attachment; filename="custom-name.zip"',
      })

      const result = await downloadAppPackage(SANITIZED_URL)

      expect(result.filename).toBe('custom-name.zip')
    })

    it('falls back to URL path basename', async () => {
      mockSuccessResponse([Buffer.from('data')])

      const result = await downloadAppPackage(SANITIZED_URL)

      expect(result.filename).toBe('my-app.zip')
    })

    it('defaults to package.zip when no filename can be inferred', async () => {
      mockedValidate.mockResolvedValue({
        sanitizedUrl: 'https://cdn.example.com/download?id=123',
        expectedFormat: 'zip',
        hostname: 'cdn.example.com',
      })
      const stream = createReadableStream([Buffer.from('data')])
      mockedAxiosGet.mockResolvedValue({
        data: stream,
        headers: { 'content-type': 'application/zip' },
      })

      const result = await downloadAppPackage(SANITIZED_URL)

      expect(result.filename).toBe('package.zip')
    })
  })

  // ---- Size enforcement ----

  describe('size limit enforcement', () => {
    it('rejects downloads exceeding MAX_PACKAGE_SIZE', async () => {
      // Create a stream that produces more than 50MB
      const bigChunk = Buffer.alloc(MAX_PACKAGE_SIZE + 1, 0x41)
      mockSuccessResponse([bigChunk])

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /maximum allowed size/,
      )
    })

    it('accepts downloads exactly at MAX_PACKAGE_SIZE', async () => {
      const exactChunk = Buffer.alloc(MAX_PACKAGE_SIZE, 0x41)
      mockSuccessResponse([exactChunk])

      const result = await downloadAppPackage(SANITIZED_URL)

      expect(result.buffer.byteLength).toBe(MAX_PACKAGE_SIZE)
    })
  })

  // ---- Empty download ----

  describe('empty download', () => {
    it('rejects a 0-byte response', async () => {
      mockSuccessResponse([])

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /empty \(0 bytes\)/,
      )
    })
  })

  // ---- HTTP errors ----

  describe('HTTP error responses', () => {
    it('throws on 404 response', async () => {
      mockedAxiosGet.mockRejectedValue({
        response: { status: 404, statusText: 'Not Found' },
      })

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /HTTP 404/,
      )
    })

    it('throws on 500 response', async () => {
      mockedAxiosGet.mockRejectedValue({
        response: { status: 500, statusText: 'Internal Server Error' },
      })

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /HTTP 500/,
      )
    })
  })

  // ---- Timeout ----

  describe('timeout', () => {
    it('throws a timeout error when ECONNABORTED', async () => {
      mockedAxiosGet.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 60000ms exceeded',
      })

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /timed out/,
      )
    })
  })

  // ---- Network errors ----

  describe('network errors', () => {
    it('wraps generic network errors', async () => {
      mockedAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /ECONNREFUSED/,
      )
    })
  })

  // ---- Content-Type validation ----

  describe('Content-Type validation', () => {
    it('rejects text/html content type', async () => {
      const stream = createReadableStream([Buffer.from('<html>')])
      // Need to add a destroy method for the assertion
      stream.destroy = jest.fn()
      mockedAxiosGet.mockResolvedValue({
        data: stream,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })

      await expect(downloadAppPackage(SANITIZED_URL)).rejects.toThrow(
        /Unexpected Content-Type/,
      )
    })

    it('accepts application/octet-stream', async () => {
      const stream = createReadableStream([Buffer.from('data')])
      mockedAxiosGet.mockResolvedValue({
        data: stream,
        headers: { 'content-type': 'application/octet-stream' },
      })

      const result = await downloadAppPackage(SANITIZED_URL)
      expect(result.buffer.toString()).toBe('data')
    })

    it('accepts missing content-type header', async () => {
      const stream = createReadableStream([Buffer.from('data')])
      mockedAxiosGet.mockResolvedValue({
        data: stream,
        headers: {},
      })

      const result = await downloadAppPackage(SANITIZED_URL)
      expect(result.buffer.toString()).toBe('data')
    })
  })

  // ---- URL validation failure ----

  describe('URL validation failure', () => {
    it('propagates validation errors', async () => {
      mockedValidate.mockRejectedValue(
        new Error('Only HTTPS URLs are allowed'),
      )

      await expect(downloadAppPackage('http://evil.com/app.zip')).rejects.toThrow(
        /Only HTTPS URLs are allowed/,
      )

      expect(mockedAxiosGet).not.toHaveBeenCalled()
    })
  })
})

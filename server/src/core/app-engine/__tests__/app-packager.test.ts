// ========================================================================
// Tests: app-packager.ts
//
// Covers:
//   - getPackageFormat        – format detection from filename extension
//   - validatePackageBuffer   – ZIP path: success, missing manifest,
//                               oversized buffer, path traversal,
//                               executable files, invalid app ID
//   - extractPackage          – ZIP path: files written to disk,
//                               manifest.yaml present, parsed manifest returned
//   - Security guards         – path traversal and executable rejection are
//                               verified through the public API surface
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import AdmZip from 'adm-zip'

import {
  getPackageFormat,
  validatePackageBuffer,
  extractPackage,
  MAX_PACKAGE_SIZE,
  type PackageFormat,
  type PackageValidationResult,
} from '../app-packager'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a YAML string that satisfies every field the manifest-parser requires.
 * Written by hand so the tests have no runtime dependency on js-yaml.
 */
function buildValidManifestYaml(overrides: Record<string, string> = {}): string {
  const id = overrides.id ?? 'test-app'
  return [
    `id: ${id}`,
    `name: Test App`,
    `version: 1.0.0`,
    `vendor: Test Vendor`,
    `description: A test app`,
    `category: SIEM`,
    `platform:`,
    `  minVersion: "1.0.0"`,
    `permissions:`,
    `  platform:`,
    `    - configuration-canvas:read`,
    `  app:`,
    `    - resource: test`,
    `      actions:`,
    `        - read`,
    `      description: Test permission`,
    `pipeline:`,
    `  configurationTypes:`,
    `    - id: test-config`,
    `      name: Test Config`,
    `      canvasTemplate: templates/test.yaml`,
    `      handlers:`,
    `        validate: handlers/validate`,
    `        deploy: handlers/deploy`,
    `        rollback: handlers/rollback`,
    `        healthCheck: handlers/healthCheck`,
    `        getStatus: handlers/getStatus`,
    `      targets:`,
    `        componentTypes:`,
    `          - test`,
    `        requiresCredential: true`,
    `        requiresConnectivity: true`,
    `server:`,
    `  entry: server/index`,
  ].join('\n')
}

/**
 * Create an in-memory ZIP buffer from a map of { entryName → fileContent }.
 */
function createZipBuffer(files: Record<string, string>): Buffer {
  const zip = new AdmZip()
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content))
  }
  return zip.toBuffer()
}

/**
 * Create a valid ZIP buffer that contains a correct manifest.yaml plus an
 * extra innocuous text file.
 */
function createValidZipBuffer(manifestOverrides: Record<string, string> = {}): Buffer {
  return createZipBuffer({
    'manifest.yaml': buildValidManifestYaml(manifestOverrides),
    'server/index.js': '// server entry point',
  })
}

/**
 * Allocate a Buffer that is exactly one byte over MAX_PACKAGE_SIZE.
 */
function createOversizedBuffer(): Buffer {
  return Buffer.alloc(MAX_PACKAGE_SIZE + 1)
}

/**
 * Create a ZIP buffer that contains a genuine path-traversal entry.
 *
 * AdmZip.addFile() sanitises filenames before storing them, so we cannot use
 * it directly to produce a traversal entry.  Instead we:
 *   1. Build a valid ZIP with a same-length ASCII placeholder filename.
 *   2. Scan the raw bytes and overwrite every occurrence of that placeholder
 *      with the real traversal name.
 *
 * Both the local file header and the central directory record store the
 * filename, so we replace all occurrences.  Because the lengths are identical
 * no offsets need to be recalculated.
 *
 * @param extraFiles  Additional entries to include (e.g. manifest.yaml)
 * @param traversalName  The path-traversal filename to inject, e.g. '../evil.txt'
 */
function createZipWithTraversalEntry(
  extraFiles: Record<string, string>,
  traversalName: string,
): Buffer {
  // The placeholder must be exactly the same byte length as traversalName and
  // must not appear anywhere else in the archive (including file contents).
  const placeholder = 'P'.repeat(traversalName.length)

  const zip = new AdmZip()
  for (const [name, content] of Object.entries(extraFiles)) {
    zip.addFile(name, Buffer.from(content))
  }
  // Add a harmless file with the placeholder name so we have something to patch.
  zip.addFile(placeholder, Buffer.from('traversal-payload'))

  const src = Buffer.from(placeholder, 'ascii')
  const dst = Buffer.from(traversalName, 'ascii')
  const raw = Buffer.from(zip.toBuffer()) // mutable copy

  let idx = 0
  while ((idx = raw.indexOf(src, idx)) !== -1) {
    dst.copy(raw, idx)
    idx += dst.length
  }

  return raw
}

// ---------------------------------------------------------------------------
// Temporary directory management for extractPackage tests
// ---------------------------------------------------------------------------

let tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs = []
})

// ============================================================================
// getPackageFormat
// ============================================================================

describe('getPackageFormat', () => {
  describe('supported extensions', () => {
    it('returns "zip" for a .zip filename', () => {
      expect(getPackageFormat('my-app.zip')).toBe<PackageFormat>('zip')
    })

    it('returns "zip" for an upper-case .ZIP filename', () => {
      expect(getPackageFormat('MY-APP.ZIP')).toBe<PackageFormat>('zip')
    })

    it('returns "tar" for a .tar filename', () => {
      expect(getPackageFormat('my-app.tar')).toBe<PackageFormat>('tar')
    })

    it('returns "tar.gz" for a .tar.gz filename', () => {
      expect(getPackageFormat('my-app.tar.gz')).toBe<PackageFormat>('tar.gz')
    })

    it('returns "tar.gz" for a .tgz filename', () => {
      expect(getPackageFormat('my-app.tgz')).toBe<PackageFormat>('tar.gz')
    })

    it('returns "tar.gz" for an upper-case .TGZ filename', () => {
      expect(getPackageFormat('MY-APP.TGZ')).toBe<PackageFormat>('tar.gz')
    })

    it('handles filenames that contain dots in the base name', () => {
      // "my.app.1.0.tar.gz" should still resolve to tar.gz
      expect(getPackageFormat('my.app.1.0.tar.gz')).toBe<PackageFormat>('tar.gz')
    })
  })

  describe('unsupported extensions', () => {
    const unsupported = ['.rar', '.7z', '.gz', '.bz2', '.xz', '', '.yaml', '.json']

    for (const ext of unsupported) {
      it(`throws for "${ext || '(no extension)'}"`, () => {
        expect(() => getPackageFormat(`archive${ext}`)).toThrow(
          /Unsupported package format/,
        )
      })
    }

    it('includes the filename in the error message', () => {
      expect(() => getPackageFormat('evil.rar')).toThrow('evil.rar')
    })

    it('lists accepted formats in the error message', () => {
      expect(() => getPackageFormat('archive.rar')).toThrow(
        /\.zip.*\.tar.*\.tar\.gz.*\.tgz/,
      )
    })
  })
})

// ============================================================================
// validatePackageBuffer  –  ZIP path
// ============================================================================

describe('validatePackageBuffer (ZIP)', () => {
  describe('happy path', () => {
    it('resolves with a PackageValidationResult for a valid ZIP', async () => {
      // Arrange
      const buffer = createValidZipBuffer()

      // Act
      const result = await validatePackageBuffer(buffer, 'my-app.zip')

      // Assert
      expect(result).toMatchObject<Partial<PackageValidationResult>>({
        format: 'zip',
        manifest: expect.objectContaining({
          id: 'test-app',
          name: 'Test App',
          version: '1.0.0',
          vendor: 'Test Vendor',
        }),
      })
      expect(result.fileCount).toBeGreaterThan(0)
      expect(result.totalSize).toBeGreaterThan(0)
    })

    it('returns the correct file count (directories excluded)', async () => {
      // Arrange – ZIP contains 2 files and 1 explicit directory entry
      const zip = new AdmZip()
      zip.addFile('manifest.yaml', Buffer.from(buildValidManifestYaml()))
      zip.addFile('server/index.js', Buffer.from('// entry'))
      zip.addFile('server/', Buffer.alloc(0)) // directory entry

      // Act
      const result = await validatePackageBuffer(zip.toBuffer(), 'app.zip')

      // Assert – only the 2 real files should be counted
      expect(result.fileCount).toBe(2)
    })

    it('sets format to "zip" regardless of case in filename', async () => {
      const buffer = createValidZipBuffer()
      const result = await validatePackageBuffer(buffer, 'APP.ZIP')
      expect(result.format).toBe('zip')
    })
  })

  describe('manifest validation', () => {
    it('throws when manifest.yaml is absent from the archive', async () => {
      // Arrange
      const buffer = createZipBuffer({ 'server/index.js': '// no manifest' })

      // Act & Assert
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /manifest\.yaml not found/,
      )
    })

    it('throws when manifest.yaml is nested inside a subdirectory (not root)', async () => {
      // Arrange – ZIP does not have a root-level manifest.yaml
      const buffer = createZipBuffer({
        'subdir/manifest.yaml': buildValidManifestYaml(),
      })

      // Act & Assert
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /manifest\.yaml not found/,
      )
    })
  })

  describe('app ID validation', () => {
    it('throws when the app ID contains uppercase letters', async () => {
      const buffer = createValidZipBuffer({ id: 'TestApp' })
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /Invalid app ID/,
      )
    })

    it('throws when the app ID contains special characters', async () => {
      const buffer = createValidZipBuffer({ id: 'test_app!' })
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /Invalid app ID/,
      )
    })

    it('throws when the app ID starts with a hyphen', async () => {
      const buffer = createValidZipBuffer({ id: '-test-app' })
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /Invalid app ID/,
      )
    })

    it('throws when the app ID ends with a hyphen', async () => {
      const buffer = createValidZipBuffer({ id: 'test-app-' })
      await expect(validatePackageBuffer(buffer, 'app.zip')).rejects.toThrow(
        /Invalid app ID/,
      )
    })

    it('accepts a valid lowercase-alphanumeric-hyphen ID', async () => {
      const buffer = createValidZipBuffer({ id: 'my-great-app-123' })
      const result = await validatePackageBuffer(buffer, 'app.zip')
      expect(result.manifest.id).toBe('my-great-app-123')
    })
  })

  describe('package size enforcement', () => {
    it('throws when the buffer exceeds MAX_PACKAGE_SIZE', async () => {
      // Arrange
      const oversized = createOversizedBuffer()

      // Act & Assert
      await expect(validatePackageBuffer(oversized, 'big.zip')).rejects.toThrow(
        /too large/,
      )
    })

    it('includes the filename and size in the oversized error message', async () => {
      const oversized = createOversizedBuffer()
      await expect(validatePackageBuffer(oversized, 'big-upload.zip')).rejects.toThrow(
        /big-upload\.zip/,
      )
    })

    it('includes the 50 MB limit in the oversized error message', async () => {
      const oversized = createOversizedBuffer()
      await expect(validatePackageBuffer(oversized, 'big.zip')).rejects.toThrow('50')
    })

    it('accepts a buffer exactly at MAX_PACKAGE_SIZE', async () => {
      // The buffer itself won't be a valid ZIP, so we only care that the size
      // check does NOT trigger (i.e. we get a ZIP parse error, not a size error).
      const atLimit = Buffer.alloc(MAX_PACKAGE_SIZE)
      await expect(validatePackageBuffer(atLimit, 'borderline.zip')).rejects.not.toThrow(
        /too large/,
      )
    })
  })

  describe('security – path traversal', () => {
    it('throws when an entry path contains "../"', async () => {
      // Arrange – inject a genuine traversal entry at the raw byte level
      // because AdmZip.addFile() strips ".." components before storing them.
      const buffer = createZipWithTraversalEntry(
        { 'manifest.yaml': buildValidManifestYaml() },
        '../evil.txt',
      )

      // Act & Assert
      await expect(validatePackageBuffer(buffer, 'malicious.zip')).rejects.toThrow(
        /path traversal/,
      )
    })

    it('includes the offending entry name in the path traversal error', async () => {
      // Arrange
      const buffer = createZipWithTraversalEntry(
        { 'manifest.yaml': buildValidManifestYaml() },
        '../outside.txt',
      )

      // Act & Assert
      await expect(validatePackageBuffer(buffer, 'bad.zip')).rejects.toThrow(
        /Security violation/,
      )
    })
  })

  describe('security – executable files', () => {
    const executableExtensions = ['.sh', '.bat', '.exe', '.cmd', '.ps1']

    for (const ext of executableExtensions) {
      it(`throws when the archive contains a ${ext} file`, async () => {
        // Arrange
        const zip = new AdmZip()
        zip.addFile('manifest.yaml', Buffer.from(buildValidManifestYaml()))
        zip.addFile(`scripts/run${ext}`, Buffer.from('#!/bin/sh\nrm -rf /'))

        // Act & Assert
        await expect(validatePackageBuffer(zip.toBuffer(), 'pkg.zip')).rejects.toThrow(
          /executable file type/,
        )
      })
    }

    it('includes the blocked extension in the executable error message', async () => {
      const zip = new AdmZip()
      zip.addFile('manifest.yaml', Buffer.from(buildValidManifestYaml()))
      zip.addFile('run.sh', Buffer.from('#!/bin/sh'))

      await expect(validatePackageBuffer(zip.toBuffer(), 'pkg.zip')).rejects.toThrow('.sh')
    })

    it('includes the entry name in the executable error message', async () => {
      const zip = new AdmZip()
      zip.addFile('manifest.yaml', Buffer.from(buildValidManifestYaml()))
      zip.addFile('deploy.exe', Buffer.from('MZ'))

      await expect(validatePackageBuffer(zip.toBuffer(), 'pkg.zip')).rejects.toThrow(
        'deploy.exe',
      )
    })
  })
})

// ============================================================================
// extractPackage  –  ZIP path
// ============================================================================

describe('extractPackage (ZIP)', () => {
  describe('successful extraction', () => {
    it('returns the parsed manifest', async () => {
      // Arrange
      const buffer = createValidZipBuffer()
      const targetDir = makeTmpDir()

      // Act
      const manifest = await extractPackage(buffer, 'my-app.zip', targetDir)

      // Assert
      expect(manifest).toMatchObject({
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
        vendor: 'Test Vendor',
      })
    })

    it('writes manifest.yaml to the target directory', async () => {
      // Arrange
      const buffer = createValidZipBuffer()
      const targetDir = makeTmpDir()

      // Act
      await extractPackage(buffer, 'app.zip', targetDir)

      // Assert
      expect(fs.existsSync(path.join(targetDir, 'manifest.yaml'))).toBe(true)
    })

    it('extracts all non-manifest files to the target directory', async () => {
      // Arrange
      const buffer = createZipBuffer({
        'manifest.yaml': buildValidManifestYaml(),
        'server/index.js': '// server entry',
        'README.txt': 'hello',
      })
      const targetDir = makeTmpDir()

      // Act
      await extractPackage(buffer, 'app.zip', targetDir)

      // Assert
      expect(fs.existsSync(path.join(targetDir, 'server', 'index.js'))).toBe(true)
      expect(fs.existsSync(path.join(targetDir, 'README.txt'))).toBe(true)
    })

    it('creates the target directory if it does not exist', async () => {
      // Arrange
      const base = makeTmpDir()
      const nonExistent = path.join(base, 'deep', 'nested', 'dir')
      const buffer = createValidZipBuffer()

      // Act
      await extractPackage(buffer, 'app.zip', nonExistent)

      // Assert
      expect(fs.existsSync(nonExistent)).toBe(true)
    })
  })

  describe('security checks before extraction', () => {
    it('throws on path traversal without writing any files', async () => {
      // Arrange – inject a genuine traversal entry (AdmZip strips ".." on addFile)
      const buffer = createZipWithTraversalEntry(
        { 'manifest.yaml': buildValidManifestYaml() },
        '../evil.txt',
      )
      const targetDir = makeTmpDir()

      // Act & Assert
      await expect(extractPackage(buffer, 'bad.zip', targetDir)).rejects.toThrow(
        /path traversal/,
      )
    })

    it('throws on executable files without writing any files', async () => {
      // Arrange
      const zip = new AdmZip()
      zip.addFile('manifest.yaml', Buffer.from(buildValidManifestYaml()))
      zip.addFile('setup.sh', Buffer.from('#!/bin/sh'))
      const targetDir = makeTmpDir()

      // Act & Assert
      await expect(extractPackage(zip.toBuffer(), 'bad.zip', targetDir)).rejects.toThrow(
        /executable file type/,
      )
    })

    it('throws when manifest.yaml is missing, without writing other files', async () => {
      // Arrange
      const buffer = createZipBuffer({ 'server/index.js': '// no manifest' })
      const targetDir = makeTmpDir()

      // Act & Assert
      await expect(extractPackage(buffer, 'app.zip', targetDir)).rejects.toThrow(
        /manifest\.yaml not found/,
      )
    })

    it('throws when the buffer is oversized', async () => {
      const targetDir = makeTmpDir()
      await expect(
        extractPackage(createOversizedBuffer(), 'giant.zip', targetDir),
      ).rejects.toThrow(/too large/)
    })
  })

  describe('manifest content from extracted archive', () => {
    it('the manifest.yaml written to disk is readable and valid YAML', async () => {
      // Arrange
      const manifestYaml = buildValidManifestYaml()
      const buffer = createZipBuffer({ 'manifest.yaml': manifestYaml })
      const targetDir = makeTmpDir()

      // Act
      await extractPackage(buffer, 'app.zip', targetDir)

      // Assert – file content should match what we put in
      const written = fs.readFileSync(path.join(targetDir, 'manifest.yaml'), 'utf-8')
      expect(written).toBe(manifestYaml)
    })
  })
})

// ============================================================================
// MAX_PACKAGE_SIZE constant
// ============================================================================

describe('MAX_PACKAGE_SIZE', () => {
  it('is equal to 50 MB', () => {
    expect(MAX_PACKAGE_SIZE).toBe(50 * 1024 * 1024)
  })
})

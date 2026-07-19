// ========================================================================
// Client entry resolution — shared by every route that turns a manifest's
// `client.entry` into a real file on disk (installed-app bundles AND
// sandbox preview bundles). Extracted so the two bundling code paths can
// never drift on how they interpret the manifest contract.
//
// Manifest client entries are declared extensionless by convention
// (`client/index`, see APP_LAYOUT in @veltrixsecops/app-sdk), so a bare
// `fs.existsSync()` check never matches the actual `client/index.tsx` file
// on disk. This resolves the way Node's require() would.
// ========================================================================

import * as fs from 'fs'

const ENTRY_CANDIDATES = [
  '',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '/index.tsx',
  '/index.ts',
  '/index.jsx',
  '/index.js',
]

/**
 * Resolve an absolute, extensionless (or already-extensioned) entry path to
 * a real file. Returns null when nothing on disk matches any candidate.
 */
export function resolveClientEntryFile(entryPath: string): string | null {
  for (const suffix of ENTRY_CANDIDATES) {
    const candidate = entryPath + suffix
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

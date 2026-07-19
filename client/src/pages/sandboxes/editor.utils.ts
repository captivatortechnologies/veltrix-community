// ========================================================================
// Sandbox Editor Utilities
//
// Deliberately dependency-free (no `@codemirror/*` imports here) so that
// importing this module from the eagerly-loaded SandboxEditorCard never pulls
// CodeMirror into the main bundle chunk — only CodeMirrorPane.tsx (itself
// lazy-loaded) imports the language packages.
// ========================================================================

/** Coarse language classification for a synced file path, by extension. */
export type FileKind = 'javascript' | 'jsx' | 'typescript' | 'tsx' | 'yaml' | 'json' | 'plain'

const EXTENSION_KIND: Record<string, FileKind> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
}

/** Classify a file by its extension for editor language + read-only messaging. Unknown/
 * missing extensions fall back to 'plain' (still editable, just no syntax highlighting). */
export function getFileKind(path: string): FileKind {
  const match = /\.([a-zA-Z0-9]+)$/.exec(path)
  const ext = match?.[1]?.toLowerCase()
  return (ext && EXTENSION_KIND[ext]) || 'plain'
}

/** Human label for the language badge in the editor toolbar. */
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  javascript: 'JavaScript',
  jsx: 'JSX',
  typescript: 'TypeScript',
  tsx: 'TSX',
  yaml: 'YAML',
  json: 'JSON',
  plain: 'Plain text',
}

/** Opaque per-page-session id sent with every PUT/DELETE so the server can echo it back on
 * the resulting sandbox:file-changed event, letting this browser tab ignore its own writes
 * (see 01_plan.md §"Loop prevention & conflicts"). One id per SandboxDetailPage mount. */
export function generateClientId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `portal-${cryptoObj.randomUUID()}`
  }
  // Fallback for environments without Web Crypto (e.g. older test runners) — not
  // cryptographically strong, but this id only needs to be unique per browser tab.
  return `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

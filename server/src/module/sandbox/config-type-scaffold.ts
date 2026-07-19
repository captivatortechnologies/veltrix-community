// ============================================================================
// Sandbox: scaffold a new configuration type
//
// Adds a configuration type to a synced sandbox app the way `veltrix init`
// scaffolds one — the canonical colocated layout:
//
//   config-types/<id>/canvas.yaml
//   config-types/<id>/defaults.yaml
//   config-types/<id>/{validate,deploy,rollback,healthCheck,driftDetect,getStatus}.ts
//   + a pipeline.configurationTypes[] entry in manifest.yaml
//
// All files are written, then the shared finalize runs ONCE (transpile +
// re-validate + registry reload + TTL renew), and a sandbox:file-changed event
// is emitted per file so the editor and the CLI's reverse-sync pick them up —
// i.e. adding a config type in the sandbox lands in the developer's local
// workspace too.
// ============================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as yaml from 'js-yaml'
import { type Sandbox } from '@prisma/client'
import { getSandboxConfig, getSandboxDir } from './sandbox.config'
import {
  loadSyncState,
  saveSyncState,
  normalizeSyncPath,
  assertSafeSyncPath,
  revalidateAndPersist,
  toDiskPath,
} from './sync.service'
import { sandboxEvents } from './sandbox.events'
import { SandboxError } from './sandbox.service'
import type { FileMutationOrigin } from './file.service'

const sha256OfBuffer = (buffer: Buffer): string =>
  crypto.createHash('sha256').update(buffer).digest('hex')

const CONFIG_TYPE_ID = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const HANDLER_NAMES = ['validate', 'deploy', 'rollback', 'healthCheck', 'driftDetect', 'getStatus'] as const

export interface AddConfigTypeInput {
  id: string
  name?: string
  componentTypes?: string[]
}

// --- boilerplate for the canonical files ---------------------------------

function canvasYaml(id: string, name: string): string {
  return `# Canvas template for the "${id}" configuration type.
# Fields shown in the Configuration Canvas editor; keys must match what
# ${id}/validate.ts checks and ${id}/deploy.ts maps to the tool's API.
id: "${id}"
name: "${name}"
entityType: "${id}"
description: "Configure ${name} through the Security-as-Code pipeline"

sections:
  - name: "General"
    icon: "settings"
    fields:
      - key: "name"
        label: "Name"
        fieldType: "text"
        required: true
        validation:
          pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$"
          maxLength: 255
`
}

function defaultsYaml(): string {
  return `# Default values used when creating a new "${''}" canvas.
General:
  name: ""
`
}

function handlerSource(handler: (typeof HANDLER_NAMES)[number]): string {
  switch (handler) {
    case 'validate':
      return `import type { PipelineContext, ValidationResult } from '@veltrixsecops/app-sdk'

export default async function validate(ctx: PipelineContext): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = []
  for (const section of ctx.canvas.sections) {
    if (!section.fields['name']) {
      errors.push({ field: 'name', message: 'Name is required', code: 'required' })
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] }
}
`
    case 'deploy':
      return `import type { DeployContext, DeployResult } from '@veltrixsecops/app-sdk'

export default async function deploy(ctx: DeployContext): Promise<DeployResult> {
  // Apply ctx.canvas to ctx.component via the tool's API (ctx.credential /
  // ctx.connectivityProvider). Capture prior state for rollback.
  return { success: true, message: 'Deployed', rollbackData: {} }
}
`
    case 'rollback':
      return `import type { RollbackContext, RollbackResult } from '@veltrixsecops/app-sdk'

export default async function rollback(ctx: RollbackContext): Promise<RollbackResult> {
  // Restore ctx.rollbackData / ctx.targetVersion on ctx.component.
  return { success: true, message: 'Rolled back' }
}
`
    case 'healthCheck':
      return `import type { HealthCheckContext, HealthCheckResult } from '@veltrixsecops/app-sdk'

export default async function healthCheck(ctx: HealthCheckContext): Promise<HealthCheckResult> {
  return { healthy: true, score: 100, checks: [] }
}
`
    case 'driftDetect':
      return `import type { DriftContext, DriftResult } from '@veltrixsecops/app-sdk'

export default async function driftDetect(ctx: DriftContext): Promise<DriftResult> {
  // Compare live state on ctx.component against ctx.deployedConfig.
  return { hasDrift: false, diffs: [] }
}
`
    case 'getStatus':
      return `import type { PipelineContext, ConfigStatus } from '@veltrixsecops/app-sdk'

export default async function getStatus(ctx: PipelineContext): Promise<ConfigStatus> {
  const latest = await ctx.platform.getLatestDeployment(ctx.canvas.canvasId, { status: 'SUCCEEDED' })
  return {
    deployed: Boolean(latest),
    version: String(ctx.canvas.version),
    lastDeployedAt: latest?.completedAt ?? '',
    componentStatuses: [],
  }
}
`
  }
}

/**
 * Insert a new configurationType entry into manifest.yaml, preserving the
 * file's existing content and comments. The entry is added as the first list
 * item under `pipeline.configurationTypes:`, matching the file's own indent.
 * Throws if the anchor can't be found (rather than silently reformatting).
 */
function patchManifest(source: string, id: string, name: string, componentTypes: string[]): string {
  const lines = source.split('\n')
  const anchorIdx = lines.findIndex((l) => /^(\s*)configurationTypes:\s*$/.test(l))
  if (anchorIdx === -1) {
    throw new SandboxError(
      'manifest.yaml has no "pipeline.configurationTypes:" block to add a configuration type to',
      422,
    )
  }

  // Detect the indent of existing list items (default: anchor indent + 2).
  const anchorIndent = (lines[anchorIdx].match(/^(\s*)/)?.[1] ?? '').length
  let itemIndent = anchorIndent + 2
  for (let i = anchorIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- /)
    if (m) {
      itemIndent = m[1].length
      break
    }
    if (lines[i].trim() !== '' && (lines[i].match(/^(\s*)/)?.[1].length ?? 0) <= anchorIndent) break
  }

  const pad = ' '.repeat(itemIndent)
  const pad2 = ' '.repeat(itemIndent + 2)
  const pad3 = ' '.repeat(itemIndent + 4)
  const comps = componentTypes.length ? `[${componentTypes.join(', ')}]` : '[]'
  const block = [
    `${pad}- id: ${id}`,
    `${pad2}name: ${JSON.stringify(name)}`,
    `${pad2}canvasTemplate: config-types/${id}/canvas.yaml`,
    `${pad2}defaultConfig: config-types/${id}/defaults.yaml`,
    `${pad2}handlers:`,
    ...HANDLER_NAMES.map((h) => `${pad3}${h}: config-types/${id}/${h}`),
    `${pad2}targets:`,
    `${pad3}componentTypes: ${comps}`,
    `${pad3}requiresCredential: true`,
    `${pad3}requiresConnectivity: true`,
  ]
  lines.splice(anchorIdx + 1, 0, ...block)
  return lines.join('\n')
}

/**
 * Add a configuration type to a synced sandbox. Writes the canonical files +
 * the manifest entry, finalizes once, and emits per-file change events.
 */
export const configTypeScaffold = {
  async addConfigType(sandbox: Sandbox, input: AddConfigTypeInput, mutation: FileMutationOrigin) {
    const id = (input.id ?? '').trim()
    if (!CONFIG_TYPE_ID.test(id)) {
      throw new SandboxError(
        `Configuration type id must match ${CONFIG_TYPE_ID} (lowercase, hyphens)`,
        400,
      )
    }
    const name = (input.name ?? '').trim() || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const componentTypes = (input.componentTypes ?? []).filter((t) => typeof t === 'string' && t.trim())

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
    const state = loadSyncState(sandboxDir)

    // The sandbox must have a manifest to add to.
    const manifestRel = 'manifest.yaml'
    const manifestAbs = toDiskPath(sandboxDir, manifestRel)
    if (!state.files[manifestRel] || !fs.existsSync(manifestAbs)) {
      throw new SandboxError('Sandbox has no manifest.yaml — sync an app before adding a configuration type', 409)
    }
    const manifestSource = fs.readFileSync(manifestAbs, 'utf8')

    // Reject a duplicate id.
    let parsed: any
    try {
      parsed = yaml.load(manifestSource)
    } catch (e) {
      throw new SandboxError(`manifest.yaml is not valid YAML: ${(e as Error).message}`, 422)
    }
    const existing: any[] = parsed?.pipeline?.configurationTypes ?? []
    if (existing.some((ct) => ct?.id === id)) {
      throw new SandboxError(`Configuration type "${id}" already exists in this sandbox`, 409)
    }

    // Guard against runaway file counts before writing a batch.
    const { maxFiles } = getSandboxConfig()
    const newFileCount = Object.keys(state.files).length + HANDLER_NAMES.length + 2 // + canvas + defaults
    if (newFileCount > maxFiles) {
      throw new SandboxError(`Adding a configuration type would exceed the file limit of ${maxFiles}`, 413)
    }

    // Build the file set: config-type files + the patched manifest.
    const files: Array<{ rel: string; content: string }> = [
      { rel: `config-types/${id}/canvas.yaml`, content: canvasYaml(id, name) },
      { rel: `config-types/${id}/defaults.yaml`, content: defaultsYaml() },
      ...HANDLER_NAMES.map((h) => ({ rel: `config-types/${id}/${h}.ts`, content: handlerSource(h) })),
      { rel: manifestRel, content: patchManifest(manifestSource, id, name, componentTypes) },
    ]

    // Write them all (hardened paths), update sync state, then finalize once.
    const changed: Array<{ path: string; sha256: string; previousSha256: string | null; size: number }> = []
    for (const { rel, content } of files) {
      assertSafeSyncPath(rel)
      const normalized = normalizeSyncPath(rel)
      const buffer = Buffer.from(content, 'utf8')
      const abs = toDiskPath(sandboxDir, normalized)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, buffer)
      const sha256 = sha256OfBuffer(buffer)
      const previousSha256 = state.files[normalized]?.sha256 ?? null
      state.files[normalized] = { sha256, size: buffer.byteLength }
      changed.push({ path: normalized, sha256, previousSha256, size: buffer.byteLength })
    }
    saveSyncState(sandboxDir, state)

    const { validation } = await revalidateAndPersist(sandbox, sandboxDir, state)

    for (const c of changed) {
      sandboxEvents.emitFileChanged(sandbox.customerId, {
        sandboxId: sandbox.id,
        path: c.path,
        sha256: c.sha256,
        previousSha256: c.previousSha256,
        size: c.size,
        origin: mutation.origin,
        originClientId: mutation.originClientId ?? null,
      })
    }
    sandboxEvents.emitValidation(sandbox.customerId, { sandboxId: sandbox.id, path: manifestRel, validation })

    return { configTypeId: id, createdPaths: changed.map((c) => c.path), validation }
  },
}

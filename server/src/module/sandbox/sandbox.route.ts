// ========================================================================
// Sandbox Routes
//
// Registered under /api/sandboxes (see server.ts). All routes:
//   - return 404 while the SANDBOX_ENABLED feature flag is off
//   - accept JWT (RBAC sandbox:manage) OR API key (sandbox:read/write scopes)
//   - declare every response field (this codebase strips undeclared fields)
// ========================================================================

import { FastifyInstance } from 'fastify'
import { isFeatureEnabled } from '../../config/feature-flags'
import { getSandboxConfig } from './sandbox.config'
import { requireSandboxAuth } from './sandbox.auth'
import { sandboxController } from './sandbox.controller'
import {
  sandboxSchema,
  sandboxListSchema,
  sandboxDetailSchema,
  createSandboxRequestSchema,
  sandboxIdParamsSchema,
  sandboxFilesQuerySchema,
  sandboxFilesResponseSchema,
  sandboxFilePathQuerySchema,
  sandboxFileContentSchema,
  sandboxFileWriteRequestSchema,
  sandboxFileWriteResponseSchema,
  sandboxFileDeleteResponseSchema,
  addConfigTypeRequestSchema,
  addConfigTypeResponseSchema,
  syncManifestRequestSchema,
  syncManifestResponseSchema,
  syncFilesResponseSchema,
  runSandboxRequestSchema,
  runSandboxResponseSchema,
  successMessageSchema,
  errorSchema,
} from './sandbox.schemas'

const GZIP_CONTENT_TYPES = ['application/gzip', 'application/x-gzip', 'application/octet-stream']

export async function sandboxRoutes(fastify: FastifyInstance) {
  // Feature gate: the whole module is invisible until SANDBOX_ENABLED=true.
  fastify.addHook('onRequest', async (_request, reply) => {
    if (!isFeatureEnabled('platform.sandbox')) {
      reply.status(404).send({ error: 'Not found' })
    }
  })

  // Raw-buffer parser for tar.gz sync uploads (scoped to this plugin).
  for (const contentType of GZIP_CONTENT_TYPES) {
    fastify.addContentTypeParser(
      contentType,
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    )
  }

  const readAuth = requireSandboxAuth('sandbox:read')
  const writeAuth = requireSandboxAuth('sandbox:write')

  // Create a sandbox
  fastify.post('/', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Create a sandbox',
      description:
        'Creates a developer sandbox for the authenticated tenant (per-tenant quota enforced)',
      body: createSandboxRequestSchema,
      response: {
        201: sandboxSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.create,
  })

  // List sandboxes
  fastify.get('/', {
    preHandler: readAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'List sandboxes',
      description: 'Returns all sandboxes for the authenticated tenant',
      response: {
        200: sandboxListSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.list,
  })

  // Get a sandbox (includes a live manifest summary once it has synced)
  fastify.get('/:id', {
    preHandler: readAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Get a sandbox',
      description:
        'Returns a single sandbox by ID, including a live manifest/validation summary ' +
        '(configuration types, declared handlers, current validity) once it has synced ' +
        'at least once. `manifest` is null for a sandbox that has never synced.',
      params: sandboxIdParamsSchema,
      response: {
        200: sandboxDetailSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.get,
  })

  // List the sandbox's synced files (from .veltrix-sync-state.json only)
  fastify.get('/:id/files', {
    preHandler: readAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'List synced sandbox files',
      description:
        'Paginated listing of the files currently synced into the sandbox (path, sha256, size), ' +
        'sourced from the sync manifest state — never a raw filesystem walk. Returns an empty ' +
        'page for a sandbox that has never synced.',
      params: sandboxIdParamsSchema,
      querystring: sandboxFilesQuerySchema,
      response: {
        200: sandboxFilesResponseSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.files,
  })

  // Sandbox app client bundle (S6.5) — bundled on demand from the manifest's
  // client.entry, blob-imported by the portal's Preview surface. UNLIKE the
  // installed-app bundle route this IS authenticated + tenant-scoped:
  // sandbox code is tenant-private, unreleased work, never public
  // marketplace code (see sandbox-client-bundle.ts).
  fastify.get('/:id/client.mjs', {
    preHandler: readAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Get the sandbox app client bundle',
      description:
        "Bundles the synced manifest's client.entry on demand (esbuild, host-runtime shims) as a " +
        'browser ES module. Authenticated + tenant-scoped, unlike installed-app bundles: sandbox ' +
        'code is tenant-private. 404 when the sandbox has never synced or declares no client entry. ' +
        'Response is raw JavaScript (Content-Type: text/javascript), never JSON, on success.',
      params: sandboxIdParamsSchema,
      response: {
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        413: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.getClientBundle,
  })

  // Read a single synced file's content (editor open)
  fastify.get('/:id/file', {
    preHandler: readAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Read a synced sandbox file',
      description:
        'Returns one synced file (path, sha256, size, content). Text is UTF-8 and capped at ' +
        '256 KB (truncated:true when larger); binary content is base64. Only files tracked in ' +
        'the sync state are served — never a raw filesystem read.',
      params: sandboxIdParamsSchema,
      querystring: sandboxFilePathQuerySchema,
      response: {
        200: sandboxFileContentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.getFile,
  })

  // Create/overwrite a single file (editor save). Optimistic concurrency + hardened.
  fastify.put('/:id/file', {
    preHandler: writeAuth,
    // Accommodate base64 (~1.33x) + JSON overhead on top of the sandbox byte cap.
    bodyLimit: getSandboxConfig().maxBytes * 2 + 1024 * 1024,
    schema: {
      tags: ['sandboxes'],
      summary: 'Write a sandbox file',
      description:
        'Creates or overwrites one file. Same ingest hardening as tar sync (path containment, ' +
        'no executables, size/file-count caps, reserved names). Pass expectedSha256 for optimistic ' +
        'concurrency (409 on mismatch). Re-transpiles server-side .ts/.tsx, re-validates the manifest, ' +
        'renews the TTL, and emits sandbox:file-changed + sandbox:validation.',
      params: sandboxIdParamsSchema,
      body: sandboxFileWriteRequestSchema,
      response: {
        200: sandboxFileWriteResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        410: errorSchema,
        413: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.putFile,
  })

  // Delete a single file + its transpiled artifact (editor delete)
  fastify.delete('/:id/file', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Delete a sandbox file',
      description:
        'Removes one synced file and its transpiled artifact, updates the sync state, re-validates ' +
        'the manifest and emits sandbox:file-changed (empty sha256 = deletion) + sandbox:validation.',
      params: sandboxIdParamsSchema,
      querystring: sandboxFilePathQuerySchema,
      response: {
        200: sandboxFileDeleteResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        410: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.deleteFile,
  })

  // Scaffold a new configuration type into the synced app (editor "Add config type")
  fastify.post('/:id/config-types', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Add a configuration type to a sandbox',
      description:
        'Scaffolds the canonical colocated layout for a new configuration type — ' +
        'config-types/<id>/{canvas.yaml, defaults.yaml, validate, deploy, rollback, healthCheck, ' +
        'driftDetect, getStatus}.ts — and adds a pipeline.configurationTypes[] entry to manifest.yaml. ' +
        'Writes all files, finalizes once (transpile + re-validate + registry reload + TTL renew), ' +
        'and emits sandbox:file-changed per file so the editor and the CLI reverse-sync pick up the ' +
        'new files in the developer’s local workspace.',
      params: sandboxIdParamsSchema,
      body: addConfigTypeRequestSchema,
      response: {
        200: addConfigTypeResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        410: errorSchema,
        413: errorSchema,
        422: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.addConfigType,
  })

  // Delete a sandbox (record + files)
  fastify.delete('/:id', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Delete a sandbox',
      description: 'Deletes the sandbox record and removes its synced files',
      params: sandboxIdParamsSchema,
      response: {
        200: successMessageSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.delete,
  })

  // Sync step 1: manifest diff
  fastify.post('/:id/sync/manifest', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Compute a sync manifest diff',
      description:
        'Client sends its local file manifest [{path, sha256, size}]; the server answers which files to upload and deletes files the client no longer has',
      params: sandboxIdParamsSchema,
      body: syncManifestRequestSchema,
      response: {
        200: syncManifestResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        410: errorSchema,
        413: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.syncManifest,
  })

  // Sync step 2: file delta upload (tar.gz body)
  fastify.put('/:id/sync/files', {
    preHandler: writeAuth,
    // Allow the archive itself up to the sandbox cap (+ small overhead);
    // uncompressed totals are enforced again during ingest.
    bodyLimit: getSandboxConfig().maxBytes + 1024 * 1024,
    schema: {
      tags: ['sandboxes'],
      summary: 'Upload changed sandbox files',
      description:
        'tar.gz body containing only the files the manifest diff requested. Hardened ingest: path traversal, executables, symlinks, size/file-count caps. Successful sync renews the sandbox TTL.',
      params: sandboxIdParamsSchema,
      consumes: GZIP_CONTENT_TYPES,
      response: {
        200: syncFilesResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        410: errorSchema,
        413: errorSchema,
        415: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.syncFiles,
  })

  // Run a synced pipeline handler in the isolated sandbox runner
  fastify.post('/:id/run', {
    preHandler: writeAuth,
    schema: {
      tags: ['sandboxes'],
      summary: 'Run a sandbox pipeline handler',
      description:
        'Executes one synced handler (validate/getStatus/healthCheck/driftDetect) in an isolated child process with scrubbed env, memory cap and hard timeout. deploy/rollback are not runnable in v1 (they mutate external systems). healthCheck/driftDetect may only target components tagged "sandbox".',
      params: sandboxIdParamsSchema,
      body: runSandboxRequestSchema,
      response: {
        200: runSandboxResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        410: errorSchema,
        429: errorSchema,
        500: errorSchema,
      },
    },
    handler: sandboxController.run,
  })
}

export default sandboxRoutes

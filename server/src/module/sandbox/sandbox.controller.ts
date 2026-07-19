// ========================================================================
// Sandbox Controller
//
// Maps HTTP requests to the sandbox/sync services and service errors to
// HTTP status codes. Tenancy comes exclusively from the authenticated
// principal (JWT or API key) — never from the request payload.
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import { loggerService } from '../logger/logger.service'
import { sandboxService, SandboxError } from './sandbox.service'
import { syncService, listFiles, getManifestSummary } from './sync.service'
import { fileService } from './file.service'
import { runService } from './run.service'
import { configTypeScaffold } from './config-type-scaffold'
import { getSandboxClientBundle } from './sandbox-client-bundle'
import { getActorUserId, getRequestOrigin } from './sandbox.auth'
import {
  DEFAULT_FILES_PAGE_LIMIT,
  type AddConfigTypeRequest,
  type CreateSandboxRequest,
  type RunSandboxRequest,
  type SandboxFilesQuery,
  type SandboxFilePathQuery,
  type SandboxFileWriteRequest,
  type SyncManifestEntry,
} from './sandbox.schemas'

function getCustomerId(request: FastifyRequest): string {
  const customerId = (request as { user?: { customerId?: string } }).user?.customerId
  if (!customerId) {
    throw new SandboxError('Authentication required', 401)
  }
  return customerId
}

function sendError(reply: FastifyReply, error: unknown, fallbackMessage: string): void {
  if (error instanceof SandboxError) {
    reply.status(error.statusCode).send({ error: error.message })
    return
  }

  // Malformed uploads (bad gzip / truncated tar) are client errors.
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code
  if (code === 'TAR_BAD_ARCHIVE' || code === 'Z_DATA_ERROR' || /zlib|gzip|tar/i.test(message)) {
    reply.status(400).send({ error: `Invalid archive: ${message}` })
    return
  }

  loggerService.error(fallbackMessage, error)
  reply.status(500).send({ error: fallbackMessage })
}

export const sandboxController = {
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const sandbox = await sandboxService.createSandbox(
        customerId,
        request.body as CreateSandboxRequest,
        getActorUserId(request),
      )
      reply.status(201).send(sandbox)
    } catch (error) {
      sendError(reply, error, 'Failed to create sandbox')
    }
  },

  list: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const sandboxes = await sandboxService.listSandboxes(customerId)
      reply.send(sandboxes)
    } catch (error) {
      sendError(reply, error, 'Failed to list sandboxes')
    }
  },

  get: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)
      const manifest = await getManifestSummary(sandbox)
      reply.send({ ...sandbox, manifest })
    } catch (error) {
      sendError(reply, error, 'Failed to fetch sandbox')
    }
  },

  files: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const { limit = DEFAULT_FILES_PAGE_LIMIT, offset = 0 } = request.query as SandboxFilesQuery
      const sandbox = await sandboxService.getSandbox(id, customerId)
      const page = listFiles(sandbox, { limit, offset })
      reply.send(page)
    } catch (error) {
      sendError(reply, error, 'Failed to list sandbox files')
    }
  },

  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      await sandboxService.deleteSandbox(id, customerId, getActorUserId(request))
      reply.send({ message: 'Sandbox deleted' })
    } catch (error) {
      sendError(reply, error, 'Failed to delete sandbox')
    }
  },

  // -------------------------------------------------------------------------
  // File read/write APIs (S6.2)
  // -------------------------------------------------------------------------

  getFile: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const { path } = request.query as SandboxFilePathQuery
      const sandbox = await sandboxService.getSandbox(id, customerId)
      const file = fileService.readFile(sandbox, path)
      reply.send(file)
    } catch (error) {
      sendError(reply, error, 'Failed to read sandbox file')
    }
  },

  putFile: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)

      if (sandbox.status === 'EXPIRED') {
        throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
      }

      const body = request.body as SandboxFileWriteRequest
      const result = await fileService.writeFile(sandbox, body, {
        origin: getRequestOrigin(request),
        originClientId: body.originClientId ?? null,
      })
      reply.send(result)
    } catch (error) {
      sendError(reply, error, 'Failed to write sandbox file')
    }
  },

  deleteFile: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const { path, originClientId } = request.query as SandboxFilePathQuery
      const sandbox = await sandboxService.getSandbox(id, customerId)

      if (sandbox.status === 'EXPIRED') {
        throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
      }

      const result = await fileService.deleteFile(sandbox, path, {
        origin: getRequestOrigin(request),
        originClientId: originClientId ?? null,
      })
      reply.send(result)
    } catch (error) {
      sendError(reply, error, 'Failed to delete sandbox file')
    }
  },

  addConfigType: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)

      if (sandbox.status === 'EXPIRED') {
        throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
      }

      const body = request.body as AddConfigTypeRequest
      const result = await configTypeScaffold.addConfigType(sandbox, body, {
        origin: getRequestOrigin(request),
        originClientId: body.originClientId ?? null,
      })
      const manifest = await getManifestSummary(sandbox)
      reply.send({ configTypeId: result.configTypeId, createdPaths: result.createdPaths, manifest })
    } catch (error) {
      sendError(reply, error, 'Failed to add configuration type')
    }
  },

  // -------------------------------------------------------------------------
  // Client bundle (S6.5) — bundled on demand, blob-imported by the portal's
  // Preview surface. Deliberately schema-less on 200: a response schema
  // would mangle the raw JavaScript string body (mirrors the installed-app
  // client-bundle route).
  // -------------------------------------------------------------------------

  getClientBundle: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)
      const code = await getSandboxClientBundle(sandbox)
      reply
        .header('Cache-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/javascript; charset=utf-8')
        .send(code)
    } catch (error) {
      sendError(reply, error, 'Failed to build sandbox client bundle')
    }
  },

  syncManifest: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)

      if (sandbox.status === 'EXPIRED') {
        throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
      }

      const diff = await syncService.applyManifest(sandbox, request.body as SyncManifestEntry[])
      reply.send(diff)
    } catch (error) {
      sendError(reply, error, 'Failed to compute sync manifest diff')
    }
  },

  syncFiles: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)

      if (sandbox.status === 'EXPIRED') {
        throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
      }

      const body = request.body
      if (!Buffer.isBuffer(body)) {
        throw new SandboxError(
          'Expected a tar.gz request body (Content-Type: application/gzip)',
          415,
        )
      }

      const result = await syncService.ingestFiles(sandbox, body)
      reply.send(result)
    } catch (error) {
      sendError(reply, error, 'Failed to ingest sandbox files')
    }
  },

  run: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request)
      const { id } = request.params as { id: string }
      const sandbox = await sandboxService.getSandbox(id, customerId)

      const result = await runService.runHandler(
        sandbox,
        request.body as RunSandboxRequest,
        getActorUserId(request),
      )
      reply.send(result)
    } catch (error) {
      sendError(reply, error, 'Failed to run sandbox handler')
    }
  },
}

// ========================================================================
// Realtime Bootstrap
//
// Attaches the shared Socket.IO WebSocketServer (lib/websocket-server) to
// the HTTP server Fastify manages, and injects it into the modules that
// publish realtime events. Before this existed, lib/websocket-server was
// never instantiated anywhere, so every emitter that depended on it
// (deployment-events, sandbox.events) silently no-oped.
//
// Wired here (live):
//   - WebSocketServer attached to fastify.server (JWT-authenticated
//     handshake, tenant rooms) — Socket.IO intercepts /socket.io/* on the
//     raw HTTP server, so Fastify hooks (CSRF, timeouts) are not involved
//   - setSandboxWebSocketServer(...) -> sandbox:synced / sandbox:status /
//     sandbox:log / sandbox:run-result reach the owning tenant
//   - fastify decorations `wsServer` + `deploymentEvents`, which is what
//     routes/websocket-routes.ts expects if it gets registered later
//
// Documented as remaining (NOT wired here):
//   - Pipeline/deployment code paths still only write DeploymentLog rows;
//     nothing calls DeploymentEventsManager.emit* yet. Adopting it inside
//     DeploymentOrchestrator is a separate change (it needs tenant/user
//     context threaded through the BullMQ job data).
//   - SessionManager-backed socket session tracking stays disabled (null):
//     the handshake authenticates via JWT, and requiring Redis here would
//     make realtime availability depend on Redis for no current benefit.
//
// Everything degrades gracefully: on any failure the server starts without
// realtime and emitters keep no-oping exactly as before.
// ========================================================================

import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import { loggerService } from '../module/logger/logger.service'
import { WebSocketServer } from './websocket-server'
import { DeploymentEventsManager } from './deployment-events'
import { setSandboxWebSocketServer } from '../module/sandbox/sandbox.events'

/**
 * Attach the WebSocket server and inject it into event publishers.
 * Must run BEFORE fastify.ready() (decorations are frozen afterwards).
 */
export function initializeRealtime(fastify: FastifyInstance): WebSocketServer | null {
  try {
    const wsServer = new WebSocketServer(fastify.server, null, config.jwtSecret)
    const deploymentEvents = new DeploymentEventsManager(wsServer)

    fastify.decorate('wsServer', wsServer)
    fastify.decorate('deploymentEvents', deploymentEvents)

    setSandboxWebSocketServer(wsServer)

    loggerService.info('[Realtime] WebSocketServer attached (Socket.IO on /socket.io)')
    return wsServer
  } catch (error) {
    loggerService.warn('[Realtime] WebSocketServer initialization skipped (non-fatal):', error)
    return null
  }
}

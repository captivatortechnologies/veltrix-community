/**
 * WebSocket Server
 *
 * Real-time communication server using Socket.io.
 * Supports multi-tenancy with per-customer rooms and namespace isolation.
 *
 * TENANCY MODEL (important):
 *   This platform's JWT carries `{ userId, customerId, roleId }` — there is NO
 *   `tenantId` claim, and the tenant IS the customer. Rooms are therefore keyed
 *   `tenant:<customerId>`. The public emit* methods keep the "tenant" name
 *   because their callers (deployment-events, sandbox.events) already pass a
 *   customerId; the value semantics are identical.
 *
 *   A socket whose credential resolves to no customer is REJECTED at the
 *   handshake — it must never join an `undefined` room (that was a latent
 *   cross-tenant broadcast leak: the previous handshake read `decoded.tenantId`,
 *   which is always undefined, so every socket joined `tenant:undefined`).
 *
 * AUTHENTICATION:
 *   `auth.token` (or `?token=`) may be EITHER:
 *     - a portal JWT  -> customer derived from the `customerId` claim
 *     - an API key    -> CLI clients; must carry the `sandbox:read` scope
 *                        (`sandbox:write` implies read); customer resolved from
 *                        the key record.
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import type { SessionManager } from './session-manager';
import { apiKeyService } from '../module/api-key/api-key.service';

/** Resolved identity a socket connects as (JWT portal user or CLI API key). */
export interface SocketPrincipal {
  customerId: string;
  userId: string;
  principalType: 'jwt' | 'apikey';
  scopes: string[];
}

/** Scope an API key must hold to open a realtime socket. */
export const SOCKET_API_KEY_SCOPE = 'sandbox:read';

/** Stable synthetic user id for API-key (CLI) sockets — mirrors apiKeyMiddleware. */
const API_KEY_SOCKET_USER_ID = '00000000-0000-4000-a000-000000000002';

/**
 * Resolve a handshake token to a socket principal, or null when it cannot be
 * authorized. Exported (and dependency-light) so the handshake can be tested
 * without a live Socket.IO transport.
 *
 * Order: try JWT first (portal), then API key (CLI). A validly-signed JWT
 * lacking a `customerId` resolves to null so it can never open a room.
 */
export async function authenticateSocketToken(
  token: unknown,
  jwtSecret: string,
): Promise<SocketPrincipal | null> {
  if (!token || typeof token !== 'string') return null;

  // 1) Portal JWT — the tenant is the customer (no tenantId claim exists).
  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      userId?: string;
      customerId?: string;
    };
    if (decoded && decoded.customerId) {
      return {
        customerId: decoded.customerId,
        userId: decoded.userId ?? `user:${decoded.customerId}`,
        principalType: 'jwt',
        scopes: [],
      };
    }
    // Signed but has no customer -> must NOT get an (undefined) room.
    return null;
  } catch {
    // Not a JWT signed with our secret — fall through to API-key resolution.
  }

  // 2) CLI API key — require the sandbox:read scope (write implies read).
  try {
    const details = await apiKeyService.getApiKeyDetails(token);
    if (!details || !details.customerId) return null;
    const scopes = details.scopes ?? [];
    const hasRead = scopes.includes('sandbox:read') || scopes.includes('sandbox:write');
    if (!hasRead) return null;
    return {
      customerId: details.customerId,
      userId: API_KEY_SOCKET_USER_ID,
      principalType: 'apikey',
      scopes,
    };
  } catch {
    return null;
  }
}

export class WebSocketServer {
  private io: SocketIOServer;
  // Optional: the WS handshake authenticates via JWT/API key directly, so
  // session tracking is not required to attach the server (no Redis dependency).
  private sessionManager: SessionManager | null;
  private jwtSecret: string;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs
  private customerRooms: Map<string, Set<string>> = new Map(); // customerId -> Set of user IDs

  constructor(httpServer: HTTPServer, sessionManager: SessionManager | null, jwtSecret: string) {
    this.sessionManager = sessionManager;
    this.jwtSecret = jwtSecret;

    // Initialize Socket.io with CORS
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupAuthentication();
    this.setupConnectionHandlers();
  }

  /**
   * Set up authentication middleware. Rejects any handshake that does not
   * resolve to a customer, so a socket can never join an `undefined` room.
   */
  private setupAuthentication(): void {
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const principal = await authenticateSocketToken(token, this.jwtSecret);
        if (!principal) {
          return next(new Error('Authentication failed'));
        }

        // Attach the resolved identity to the socket for the connection handler.
        socket.customerId = principal.customerId;
        socket.userId = principal.userId;
        socket.principalType = principal.principalType;
        socket.scopes = principal.scopes;

        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Set up connection handlers
   */
  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: any) => {
      const { userId, customerId, principalType } = socket;

      console.log(`Socket connected: ${userId} (customer: ${customerId}, via: ${principalType})`);

      // Track connected user
      this.trackConnection(userId, customerId, socket.id);

      // Join tenant room for tenant-wide broadcasts (keyed by customerId).
      socket.join(`tenant:${customerId}`);

      // Join user room for user-specific messages
      socket.join(`user:${userId}`);

      // Send connection confirmation
      socket.emit('connected', {
        userId,
        customerId,
        principalType,
        timestamp: Date.now()
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${userId}`);
        this.untrackConnection(userId, customerId, socket.id);
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        console.error(`Socket error for user ${userId}:`, error);
      });

      // Presence heartbeat
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Join custom room
      socket.on('join:room', (room: string) => {
        if (this.canJoinRoom(socket, room)) {
          socket.join(room);
          socket.emit('joined:room', { room, timestamp: Date.now() });
        } else {
          socket.emit('error', { message: 'Permission denied to join room', room });
        }
      });

      // Leave custom room
      socket.on('leave:room', (room: string) => {
        socket.leave(room);
        socket.emit('left:room', { room, timestamp: Date.now() });
      });

      // Request presence of users
      socket.on('presence:request', (userIds: string[]) => {
        const presence = this.getUsersPresence(userIds, customerId);
        socket.emit('presence:response', presence);
      });
    });
  }

  /**
   * Track user connection
   */
  private trackConnection(userId: string, customerId: string, socketId: string): void {
    // Track user sockets
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);

    // Track customer users
    if (!this.customerRooms.has(customerId)) {
      this.customerRooms.set(customerId, new Set());
    }
    this.customerRooms.get(customerId)!.add(userId);

    // Broadcast user presence to the customer's room
    this.io.to(`tenant:${customerId}`).emit('presence:online', {
      userId,
      timestamp: Date.now()
    });
  }

  /**
   * Untrack user connection
   */
  private untrackConnection(userId: string, customerId: string, socketId: string): void {
    // Remove socket from user
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);

        // User fully disconnected, remove from customer set
        const customerUsers = this.customerRooms.get(customerId);
        if (customerUsers) {
          customerUsers.delete(userId);
        }

        // Broadcast user offline to the customer's room
        this.io.to(`tenant:${customerId}`).emit('presence:offline', {
          userId,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Check if a socket can join a room. Tenant rooms require the socket's own
   * customer — a socket can never subscribe to another customer's room.
   */
  private canJoinRoom(socket: any, room: string): boolean {
    // Tenant rooms require matching customer ID
    if (room.startsWith('tenant:')) {
      const roomCustomerId = room.replace('tenant:', '');
      return socket.customerId === roomCustomerId;
    }

    // Deployment rooms require tenant access
    if (room.startsWith('deployment:')) {
      // TODO: Check if deployment belongs to tenant
      return true;
    }

    // Default: allow
    return true;
  }

  /**
   * Get presence status for multiple users within a customer.
   */
  private getUsersPresence(userIds: string[], customerId: string): Record<string, boolean> {
    const presence: Record<string, boolean> = {};
    const customerUsers = this.customerRooms.get(customerId);

    for (const userId of userIds) {
      presence[userId] = customerUsers?.has(userId) || false;
    }

    return presence;
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit event to all sockets of a tenant (customer). `customerId` is the room
   * key; callers historically named the parameter "tenantId" — same value.
   */
  emitToTenant(customerId: string, event: string, data: any): void {
    this.io.to(`tenant:${customerId}`).emit(event, data);
  }

  /**
   * Emit event to specific room
   */
  emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  /**
   * Emit event to all connected clients
   */
  emitToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get connected users count for a tenant (customer)
   */
  getTenantUserCount(customerId: string): number {
    return this.customerRooms.get(customerId)?.size || 0;
  }

  /**
   * Get all connected users for a tenant (customer)
   */
  getTenantUsers(customerId: string): string[] {
    return Array.from(this.customerRooms.get(customerId) || []);
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get total connected users count
   */
  getTotalConnectedUsers(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    connectedUsers: number;
    activeTenants: number;
    totalSockets: number;
  } {
    const totalSockets = Array.from(this.connectedUsers.values()).reduce(
      (sum, sockets) => sum + sockets.size,
      0
    );

    return {
      connectedUsers: this.connectedUsers.size,
      activeTenants: this.customerRooms.size,
      totalSockets
    };
  }

  /**
   * Disconnect user
   */
  disconnectUser(userId: string): void {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      for (const socketId of userSockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        socket?.disconnect(true);
      }
    }
  }

  /**
   * Disconnect all users in a tenant (customer)
   */
  disconnectTenant(customerId: string): void {
    const customerUsers = this.customerRooms.get(customerId);
    if (customerUsers) {
      for (const userId of customerUsers) {
        this.disconnectUser(userId);
      }
    }
  }

  /**
   * Get Socket.io instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }
}

export default WebSocketServer;

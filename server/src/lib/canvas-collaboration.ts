/**
 * Canvas Collaboration Manager
 *
 * Manages real-time collaboration for Configuration Canvas.
 * Handles presence, cursor tracking, section locking, and change broadcasting.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';

// Types
export interface CanvasUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  joinedAt: number;
}

export interface CursorPosition {
  x: number;
  y: number;
  sectionId?: string;
  fieldId?: string;
}

export interface SectionLock {
  sectionId: string;
  userId: string;
  userName: string;
  lockedAt: number;
  expiresAt: number;
}

export interface CanvasChange {
  type: 'section:add' | 'section:update' | 'section:delete' | 'section:move' | 'field:update';
  canvasId: string;
  userId: string;
  userName: string;
  payload: unknown;
  timestamp: number;
}

interface CanvasRoom {
  canvasId: string;
  users: Map<string, CanvasUser>;
  cursors: Map<string, CursorPosition>;
  locks: Map<string, SectionLock>;
  lastActivity: number;
}

// User colors for collaboration indicators
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF7F50'
];

export class CanvasCollaborationManager {
  private io: SocketIOServer;
  private canvasRooms: Map<string, CanvasRoom> = new Map();
  private userColorMap: Map<string, string> = new Map();
  private colorIndex = 0;

  // Lock expiration time (5 minutes)
  private readonly LOCK_EXPIRATION_MS = 5 * 60 * 1000;
  // Cleanup interval for expired locks
  private cleanupInterval: NodeJS.Timeout;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();

    // Cleanup expired locks every minute
    this.cleanupInterval = setInterval(() => this.cleanupExpiredLocks(), 60 * 1000);
  }

  /**
   * Get or assign a color for a user
   */
  private getUserColor(userId: string): string {
    if (!this.userColorMap.has(userId)) {
      this.userColorMap.set(userId, USER_COLORS[this.colorIndex % USER_COLORS.length]);
      this.colorIndex++;
    }
    return this.userColorMap.get(userId)!;
  }

  /**
   * Setup WebSocket event handlers for canvas collaboration
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const { userId, tenantId } = socket as any;

      // Join canvas room
      socket.on('canvas:join', async (data: {
        canvasId: string;
        userName: string;
        userEmail: string;
        userAvatar?: string;
      }) => {
        await this.handleJoinCanvas(socket, {
          userId,
          tenantId,
          ...data
        });
      });

      // Leave canvas room
      socket.on('canvas:leave', (data: { canvasId: string }) => {
        this.handleLeaveCanvas(socket, { userId, canvasId: data.canvasId });
      });

      // Cursor movement
      socket.on('canvas:cursor', (data: {
        canvasId: string;
        position: CursorPosition
      }) => {
        this.handleCursorMove(socket, { userId, ...data });
      });

      // Request section lock
      socket.on('canvas:lock:request', (data: {
        canvasId: string;
        sectionId: string;
        userName: string;
      }) => {
        this.handleLockRequest(socket, { userId, ...data });
      });

      // Release section lock
      socket.on('canvas:lock:release', (data: {
        canvasId: string;
        sectionId: string
      }) => {
        this.handleLockRelease(socket, { userId, ...data });
      });

      // Broadcast section change
      socket.on('canvas:section:add', (data: {
        canvasId: string;
        section: unknown;
        userName: string;
      }) => {
        this.broadcastChange(socket, {
          type: 'section:add',
          canvasId: data.canvasId,
          userId,
          userName: data.userName,
          payload: data.section,
          timestamp: Date.now()
        });
      });

      socket.on('canvas:section:update', (data: {
        canvasId: string;
        sectionId: string;
        updates: unknown;
        userName: string;
      }) => {
        this.broadcastChange(socket, {
          type: 'section:update',
          canvasId: data.canvasId,
          userId,
          userName: data.userName,
          payload: { sectionId: data.sectionId, updates: data.updates },
          timestamp: Date.now()
        });
      });

      socket.on('canvas:section:delete', (data: {
        canvasId: string;
        sectionId: string;
        userName: string;
      }) => {
        // Release any locks on the deleted section
        this.forceReleaseLock(data.canvasId, data.sectionId);

        this.broadcastChange(socket, {
          type: 'section:delete',
          canvasId: data.canvasId,
          userId,
          userName: data.userName,
          payload: { sectionId: data.sectionId },
          timestamp: Date.now()
        });
      });

      socket.on('canvas:section:move', (data: {
        canvasId: string;
        sectionId: string;
        position: { x: number; y: number };
        userName: string;
      }) => {
        this.broadcastChange(socket, {
          type: 'section:move',
          canvasId: data.canvasId,
          userId,
          userName: data.userName,
          payload: { sectionId: data.sectionId, position: data.position },
          timestamp: Date.now()
        });
      });

      socket.on('canvas:field:update', (data: {
        canvasId: string;
        sectionId: string;
        fieldId: string;
        value: unknown;
        userName: string;
      }) => {
        this.broadcastChange(socket, {
          type: 'field:update',
          canvasId: data.canvasId,
          userId,
          userName: data.userName,
          payload: {
            sectionId: data.sectionId,
            fieldId: data.fieldId,
            value: data.value
          },
          timestamp: Date.now()
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket, userId);
      });
    });
  }

  /**
   * Handle user joining a canvas
   */
  private async handleJoinCanvas(
    socket: Socket,
    data: {
      userId: string;
      tenantId: string;
      canvasId: string;
      userName: string;
      userEmail: string;
      userAvatar?: string;
    }
  ): Promise<void> {
    const { userId, tenantId, canvasId, userName, userEmail, userAvatar } = data;
    const roomId = `canvas:${tenantId}:${canvasId}`;

    // Get or create room
    let room = this.canvasRooms.get(roomId);
    if (!room) {
      room = {
        canvasId,
        users: new Map(),
        cursors: new Map(),
        locks: new Map(),
        lastActivity: Date.now()
      };
      this.canvasRooms.set(roomId, room);
    }

    // Add user to room
    const user: CanvasUser = {
      id: userId,
      name: userName,
      email: userEmail,
      avatar: userAvatar,
      color: this.getUserColor(userId),
      joinedAt: Date.now()
    };
    room.users.set(userId, user);
    room.lastActivity = Date.now();

    // Join socket room
    socket.join(roomId);

    // Notify others that user joined
    socket.to(roomId).emit('canvas:user:joined', {
      user,
      usersCount: room.users.size
    });

    // Send current room state to joining user
    socket.emit('canvas:state', {
      canvasId,
      users: Array.from(room.users.values()),
      cursors: Object.fromEntries(room.cursors),
      locks: Array.from(room.locks.values())
    });

    console.log(`User ${userName} joined canvas ${canvasId}`);
  }

  /**
   * Handle user leaving a canvas
   */
  private handleLeaveCanvas(
    socket: Socket,
    data: { userId: string; canvasId: string }
  ): void {
    const rooms = this.findUserRooms(data.userId);

    for (const roomId of rooms) {
      if (roomId.includes(data.canvasId)) {
        this.removeUserFromRoom(socket, roomId, data.userId);
      }
    }
  }

  /**
   * Handle user disconnect
   */
  private handleDisconnect(socket: Socket, userId: string): void {
    // Find all rooms the user was in
    const rooms = this.findUserRooms(userId);

    for (const roomId of rooms) {
      this.removeUserFromRoom(socket, roomId, userId);
    }
  }

  /**
   * Remove user from a room and cleanup
   */
  private removeUserFromRoom(socket: Socket, roomId: string, userId: string): void {
    const room = this.canvasRooms.get(roomId);
    if (!room) return;

    const user = room.users.get(userId);

    // Remove user
    room.users.delete(userId);
    room.cursors.delete(userId);

    // Release any locks held by this user
    for (const [sectionId, lock] of room.locks.entries()) {
      if (lock.userId === userId) {
        room.locks.delete(sectionId);
        this.io.to(roomId).emit('canvas:lock:released', {
          sectionId,
          userId,
          reason: 'user_left'
        });
      }
    }

    // Notify others
    if (user) {
      socket.to(roomId).emit('canvas:user:left', {
        userId,
        userName: user.name,
        usersCount: room.users.size
      });
    }

    // Leave socket room
    socket.leave(roomId);

    // Cleanup empty rooms
    if (room.users.size === 0) {
      this.canvasRooms.delete(roomId);
    }

    console.log(`User ${userId} left room ${roomId}`);
  }

  /**
   * Find all rooms a user is in
   */
  private findUserRooms(userId: string): string[] {
    const rooms: string[] = [];
    for (const [roomId, room] of this.canvasRooms.entries()) {
      if (room.users.has(userId)) {
        rooms.push(roomId);
      }
    }
    return rooms;
  }

  /**
   * Handle cursor movement
   */
  private handleCursorMove(
    socket: Socket,
    data: { userId: string; canvasId: string; position: CursorPosition }
  ): void {
    const roomId = this.findRoomByCanvas(data.canvasId);
    if (!roomId) return;

    const room = this.canvasRooms.get(roomId);
    if (!room) return;

    // Update cursor position
    room.cursors.set(data.userId, data.position);
    room.lastActivity = Date.now();

    // Broadcast to others
    socket.to(roomId).emit('canvas:cursor:move', {
      userId: data.userId,
      position: data.position
    });
  }

  /**
   * Handle lock request
   */
  private handleLockRequest(
    socket: Socket,
    data: { userId: string; canvasId: string; sectionId: string; userName: string }
  ): void {
    const roomId = this.findRoomByCanvas(data.canvasId);
    if (!roomId) {
      socket.emit('canvas:lock:denied', {
        sectionId: data.sectionId,
        reason: 'room_not_found'
      });
      return;
    }

    const room = this.canvasRooms.get(roomId);
    if (!room) return;

    const existingLock = room.locks.get(data.sectionId);

    // Check if already locked by another user
    if (existingLock && existingLock.userId !== data.userId) {
      socket.emit('canvas:lock:denied', {
        sectionId: data.sectionId,
        reason: 'already_locked',
        lockedBy: existingLock.userName
      });
      return;
    }

    // Grant lock
    const lock: SectionLock = {
      sectionId: data.sectionId,
      userId: data.userId,
      userName: data.userName,
      lockedAt: Date.now(),
      expiresAt: Date.now() + this.LOCK_EXPIRATION_MS
    };
    room.locks.set(data.sectionId, lock);
    room.lastActivity = Date.now();

    // Confirm to requester
    socket.emit('canvas:lock:granted', {
      sectionId: data.sectionId,
      expiresAt: lock.expiresAt
    });

    // Notify others
    socket.to(roomId).emit('canvas:lock:acquired', {
      sectionId: data.sectionId,
      userId: data.userId,
      userName: data.userName,
      expiresAt: lock.expiresAt
    });
  }

  /**
   * Handle lock release
   */
  private handleLockRelease(
    socket: Socket,
    data: { userId: string; canvasId: string; sectionId: string }
  ): void {
    const roomId = this.findRoomByCanvas(data.canvasId);
    if (!roomId) return;

    const room = this.canvasRooms.get(roomId);
    if (!room) return;

    const lock = room.locks.get(data.sectionId);
    if (!lock || lock.userId !== data.userId) {
      socket.emit('canvas:lock:error', {
        sectionId: data.sectionId,
        reason: 'not_owner'
      });
      return;
    }

    room.locks.delete(data.sectionId);
    room.lastActivity = Date.now();

    // Notify all including requester
    this.io.to(roomId).emit('canvas:lock:released', {
      sectionId: data.sectionId,
      userId: data.userId,
      reason: 'user_released'
    });
  }

  /**
   * Force release a lock (for section deletion)
   */
  private forceReleaseLock(canvasId: string, sectionId: string): void {
    const roomId = this.findRoomByCanvas(canvasId);
    if (!roomId) return;

    const room = this.canvasRooms.get(roomId);
    if (!room) return;

    const lock = room.locks.get(sectionId);
    if (lock) {
      room.locks.delete(sectionId);
      this.io.to(roomId).emit('canvas:lock:released', {
        sectionId,
        userId: lock.userId,
        reason: 'section_deleted'
      });
    }
  }

  /**
   * Broadcast a change to all users in the canvas
   */
  private broadcastChange(socket: Socket, change: CanvasChange): void {
    const roomId = this.findRoomByCanvas(change.canvasId);
    if (!roomId) return;

    const room = this.canvasRooms.get(roomId);
    if (room) {
      room.lastActivity = Date.now();
    }

    // Broadcast to all including sender for consistency
    this.io.to(roomId).emit(`canvas:change`, change);
  }

  /**
   * Find room ID by canvas ID
   */
  private findRoomByCanvas(canvasId: string): string | null {
    for (const roomId of this.canvasRooms.keys()) {
      if (roomId.includes(canvasId)) {
        return roomId;
      }
    }
    return null;
  }

  /**
   * Cleanup expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();

    for (const [roomId, room] of this.canvasRooms.entries()) {
      for (const [sectionId, lock] of room.locks.entries()) {
        if (lock.expiresAt < now) {
          room.locks.delete(sectionId);
          this.io.to(roomId).emit('canvas:lock:released', {
            sectionId,
            userId: lock.userId,
            reason: 'expired'
          });
        }
      }
    }
  }

  /**
   * Get room statistics
   */
  getStatistics(): {
    activeRooms: number;
    totalUsers: number;
    activeLocks: number;
  } {
    let totalUsers = 0;
    let activeLocks = 0;

    for (const room of this.canvasRooms.values()) {
      totalUsers += room.users.size;
      activeLocks += room.locks.size;
    }

    return {
      activeRooms: this.canvasRooms.size,
      totalUsers,
      activeLocks
    };
  }

  /**
   * Get users in a canvas
   */
  getCanvasUsers(tenantId: string, canvasId: string): CanvasUser[] {
    const roomId = `canvas:${tenantId}:${canvasId}`;
    const room = this.canvasRooms.get(roomId);
    return room ? Array.from(room.users.values()) : [];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.canvasRooms.clear();
    this.userColorMap.clear();
  }
}

export default CanvasCollaborationManager;

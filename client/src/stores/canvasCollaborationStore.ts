/**
 * Canvas Collaboration Store
 *
 * Manages real-time collaboration state for Configuration Canvas.
 * Handles presence, cursors, section locking, and change synchronization.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Socket } from 'socket.io-client';

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

interface CanvasCollaborationState {
  // Connection state
  isConnected: boolean;
  currentCanvasId: string | null;
  socket: Socket | null;

  // Users in the canvas
  users: Map<string, CanvasUser>;
  currentUser: CanvasUser | null;

  // Cursors
  cursors: Map<string, CursorPosition>;

  // Section locks
  locks: Map<string, SectionLock>;
  pendingLockRequests: Set<string>;

  // Change history (for undo/redo if needed)
  pendingChanges: CanvasChange[];
  lastSyncedAt: number;

  // Actions
  setSocket: (socket: Socket | null) => void;
  joinCanvas: (canvasId: string, user: CanvasUser) => void;
  leaveCanvas: () => void;

  // User actions
  addUser: (user: CanvasUser) => void;
  removeUser: (userId: string) => void;
  setUsers: (users: CanvasUser[]) => void;

  // Cursor actions
  updateCursor: (userId: string, position: CursorPosition) => void;
  updateMyCursor: (position: CursorPosition) => void;
  removeCursor: (userId: string) => void;
  setCursors: (cursors: Record<string, CursorPosition>) => void;

  // Lock actions
  requestLock: (sectionId: string) => void;
  releaseLock: (sectionId: string) => void;
  setLock: (lock: SectionLock) => void;
  removeLock: (sectionId: string) => void;
  setLocks: (locks: SectionLock[]) => void;
  isLockedByOther: (sectionId: string) => boolean;
  isLockedByMe: (sectionId: string) => boolean;
  getLockOwner: (sectionId: string) => SectionLock | undefined;

  // Change actions
  broadcastSectionAdd: (section: unknown) => void;
  broadcastSectionUpdate: (sectionId: string, updates: unknown) => void;
  broadcastSectionDelete: (sectionId: string) => void;
  broadcastSectionMove: (sectionId: string, position: { x: number; y: number }) => void;
  broadcastFieldUpdate: (sectionId: string, fieldId: string, value: unknown) => void;
  addPendingChange: (change: CanvasChange) => void;
  clearPendingChanges: () => void;

  // State sync
  handleCanvasState: (state: {
    canvasId: string;
    users: CanvasUser[];
    cursors: Record<string, CursorPosition>;
    locks: SectionLock[];
  }) => void;

  // Callbacks for components
  onChangeReceived: ((change: CanvasChange) => void) | null;
  setOnChangeReceived: (callback: ((change: CanvasChange) => void) | null) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  isConnected: false,
  currentCanvasId: null,
  socket: null,
  users: new Map<string, CanvasUser>(),
  currentUser: null,
  cursors: new Map<string, CursorPosition>(),
  locks: new Map<string, SectionLock>(),
  pendingLockRequests: new Set<string>(),
  pendingChanges: [] as CanvasChange[],
  lastSyncedAt: 0,
  onChangeReceived: null as ((change: CanvasChange) => void) | null,
};

export const useCanvasCollaborationStore = create<CanvasCollaborationState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setSocket: (socket) => {
        set({ socket, isConnected: !!socket });
      },

      joinCanvas: (canvasId, user) => {
        const { socket } = get();
        if (!socket) return;

        socket.emit('canvas:join', {
          canvasId,
          userName: user.name,
          userEmail: user.email,
          userAvatar: user.avatar,
        });

        set({
          currentCanvasId: canvasId,
          currentUser: user,
        });
      },

      leaveCanvas: () => {
        const { socket, currentCanvasId } = get();
        if (socket && currentCanvasId) {
          socket.emit('canvas:leave', { canvasId: currentCanvasId });
        }

        set({
          currentCanvasId: null,
          users: new Map(),
          cursors: new Map(),
          locks: new Map(),
          pendingLockRequests: new Set(),
          pendingChanges: [],
        });
      },

      addUser: (user) =>
        set((state) => {
          const newUsers = new Map(state.users);
          newUsers.set(user.id, user);
          return { users: newUsers };
        }),

      removeUser: (userId) =>
        set((state) => {
          const newUsers = new Map(state.users);
          const newCursors = new Map(state.cursors);
          newUsers.delete(userId);
          newCursors.delete(userId);
          return { users: newUsers, cursors: newCursors };
        }),

      setUsers: (users) =>
        set({
          users: new Map(users.map((u) => [u.id, u])),
        }),

      updateCursor: (userId, position) =>
        set((state) => {
          const newCursors = new Map(state.cursors);
          newCursors.set(userId, position);
          return { cursors: newCursors };
        }),

      updateMyCursor: (position) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:cursor', {
          canvasId: currentCanvasId,
          position,
        });
      },

      removeCursor: (userId) =>
        set((state) => {
          const newCursors = new Map(state.cursors);
          newCursors.delete(userId);
          return { cursors: newCursors };
        }),

      setCursors: (cursors) =>
        set({
          cursors: new Map(Object.entries(cursors)),
        }),

      requestLock: (sectionId) => {
        const { socket, currentCanvasId, currentUser, pendingLockRequests } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        // Already pending
        if (pendingLockRequests.has(sectionId)) return;

        socket.emit('canvas:lock:request', {
          canvasId: currentCanvasId,
          sectionId,
          userName: currentUser.name,
        });

        set((state) => {
          const newPending = new Set(state.pendingLockRequests);
          newPending.add(sectionId);
          return { pendingLockRequests: newPending };
        });
      },

      releaseLock: (sectionId) => {
        const { socket, currentCanvasId } = get();
        if (!socket || !currentCanvasId) return;

        socket.emit('canvas:lock:release', {
          canvasId: currentCanvasId,
          sectionId,
        });
      },

      setLock: (lock) =>
        set((state) => {
          const newLocks = new Map(state.locks);
          const newPending = new Set(state.pendingLockRequests);
          newLocks.set(lock.sectionId, lock);
          newPending.delete(lock.sectionId);
          return { locks: newLocks, pendingLockRequests: newPending };
        }),

      removeLock: (sectionId) =>
        set((state) => {
          const newLocks = new Map(state.locks);
          const newPending = new Set(state.pendingLockRequests);
          newLocks.delete(sectionId);
          newPending.delete(sectionId);
          return { locks: newLocks, pendingLockRequests: newPending };
        }),

      setLocks: (locks) =>
        set({
          locks: new Map(locks.map((l) => [l.sectionId, l])),
        }),

      isLockedByOther: (sectionId) => {
        const { locks, currentUser } = get();
        const lock = locks.get(sectionId);
        return !!lock && lock.userId !== currentUser?.id;
      },

      isLockedByMe: (sectionId) => {
        const { locks, currentUser } = get();
        const lock = locks.get(sectionId);
        return !!lock && lock.userId === currentUser?.id;
      },

      getLockOwner: (sectionId) => {
        const { locks } = get();
        return locks.get(sectionId);
      },

      broadcastSectionAdd: (section) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:section:add', {
          canvasId: currentCanvasId,
          section,
          userName: currentUser.name,
        });
      },

      broadcastSectionUpdate: (sectionId, updates) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:section:update', {
          canvasId: currentCanvasId,
          sectionId,
          updates,
          userName: currentUser.name,
        });
      },

      broadcastSectionDelete: (sectionId) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:section:delete', {
          canvasId: currentCanvasId,
          sectionId,
          userName: currentUser.name,
        });
      },

      broadcastSectionMove: (sectionId, position) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:section:move', {
          canvasId: currentCanvasId,
          sectionId,
          position,
          userName: currentUser.name,
        });
      },

      broadcastFieldUpdate: (sectionId, fieldId, value) => {
        const { socket, currentCanvasId, currentUser } = get();
        if (!socket || !currentCanvasId || !currentUser) return;

        socket.emit('canvas:field:update', {
          canvasId: currentCanvasId,
          sectionId,
          fieldId,
          value,
          userName: currentUser.name,
        });
      },

      addPendingChange: (change) =>
        set((state) => ({
          pendingChanges: [...state.pendingChanges, change],
        })),

      clearPendingChanges: () =>
        set({
          pendingChanges: [],
          lastSyncedAt: Date.now(),
        }),

      handleCanvasState: (state) => {
        set({
          users: new Map(state.users.map((u) => [u.id, u])),
          cursors: new Map(Object.entries(state.cursors)),
          locks: new Map(state.locks.map((l) => [l.sectionId, l])),
        });
      },

      setOnChangeReceived: (callback) =>
        set({ onChangeReceived: callback }),

      reset: () => set(initialState),
    }),
    { name: 'CanvasCollaborationStore' }
  )
);

export default useCanvasCollaborationStore;

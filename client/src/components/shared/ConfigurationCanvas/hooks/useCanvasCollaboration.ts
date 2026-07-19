/**
 * useCanvasCollaboration Hook
 *
 * Manages real-time collaboration features for the Configuration Canvas.
 * Integrates with WebSocket for presence, cursors, locks, and change sync.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useDeploymentStore } from '@/stores/deploymentStore';
import {
  useCanvasCollaborationStore,
  type CanvasUser,
  type CanvasChange,
  type CursorPosition,
  type SectionLock,
} from '@/stores/canvasCollaborationStore';

export interface UseCanvasCollaborationOptions {
  canvasId?: string;
  enabled?: boolean;
  userName?: string;
  userEmail?: string;
  userId?: string;
  userAvatar?: string;
  onUserJoined?: (user: CanvasUser) => void;
  onUserLeft?: (userId: string, userName: string) => void;
  onChangeReceived?: (change: CanvasChange) => void;
  onLockGranted?: (sectionId: string) => void;
  onLockDenied?: (sectionId: string, reason: string, lockedBy?: string) => void;
  onLockReleased?: (sectionId: string) => void;
}

export interface UseCanvasCollaborationReturn {
  // State
  isConnected: boolean;
  users: CanvasUser[];
  cursors: Map<string, CursorPosition>;
  locks: Map<string, SectionLock>;

  // Cursor actions
  updateMyCursor: (position: CursorPosition) => void;

  // Lock actions
  requestLock: (sectionId: string) => void;
  releaseLock: (sectionId: string) => void;
  isLockedByOther: (sectionId: string) => boolean;
  isLockedByMe: (sectionId: string) => boolean;
  getLockOwner: (sectionId: string) => SectionLock | undefined;

  // Change broadcasting
  broadcastSectionAdd: (section: unknown) => void;
  broadcastSectionUpdate: (sectionId: string, updates: unknown) => void;
  broadcastSectionDelete: (sectionId: string) => void;
  broadcastSectionMove: (sectionId: string, position: { x: number; y: number }) => void;
  broadcastFieldUpdate: (sectionId: string, fieldId: string, value: unknown) => void;
}

// User colors for collaboration indicators
const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF7F50',
];

/**
 * Get a consistent color for a user based on their ID
 */
function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export const useCanvasCollaboration = (
  options: UseCanvasCollaborationOptions
): UseCanvasCollaborationReturn => {
  const {
    canvasId,
    enabled = true,
    userName = 'Anonymous',
    userEmail = '',
    userId = `user-${Date.now()}`,
    userAvatar,
    onUserJoined,
    onUserLeft,
    onChangeReceived,
    onLockGranted,
    onLockDenied,
    onLockReleased,
  } = options;

  // Refs for callbacks to avoid stale closures
  const callbacksRef = useRef({
    onUserJoined,
    onUserLeft,
    onChangeReceived,
    onLockGranted,
    onLockDenied,
    onLockReleased,
  });
  callbacksRef.current = {
    onUserJoined,
    onUserLeft,
    onChangeReceived,
    onLockGranted,
    onLockDenied,
    onLockReleased,
  };

  // Get socket from deployment store
  const socket = useDeploymentStore((state) => state.socket);
  const isConnected = useDeploymentStore((state) => state.isConnected);

  // Get collaboration store state and actions
  const store = useCanvasCollaborationStore();

  // Setup socket listeners
  useEffect(() => {
    if (!socket || !enabled || !canvasId) return;

    // Set socket in collaboration store
    store.setSocket(socket);

    // Create current user object
    const currentUser: CanvasUser = {
      id: userId,
      name: userName,
      email: userEmail,
      avatar: userAvatar,
      color: getUserColor(userId),
      joinedAt: Date.now(),
    };

    // Join canvas room
    store.joinCanvas(canvasId, currentUser);

    // Socket event handlers
    const handleCanvasState = (state: {
      canvasId: string;
      users: CanvasUser[];
      cursors: Record<string, CursorPosition>;
      locks: SectionLock[];
    }) => {
      store.handleCanvasState(state);
    };

    const handleUserJoined = (data: { user: CanvasUser; usersCount: number }) => {
      store.addUser(data.user);
      callbacksRef.current.onUserJoined?.(data.user);
    };

    const handleUserLeft = (data: { userId: string; userName: string; usersCount: number }) => {
      store.removeUser(data.userId);
      callbacksRef.current.onUserLeft?.(data.userId, data.userName);
    };

    const handleCursorMove = (data: { userId: string; position: CursorPosition }) => {
      store.updateCursor(data.userId, data.position);
    };

    const handleLockGranted = (data: { sectionId: string; expiresAt: number }) => {
      store.setLock({
        sectionId: data.sectionId,
        userId,
        userName,
        lockedAt: Date.now(),
        expiresAt: data.expiresAt,
      });
      callbacksRef.current.onLockGranted?.(data.sectionId);
    };

    const handleLockDenied = (data: { sectionId: string; reason: string; lockedBy?: string }) => {
      store.removeLock(data.sectionId);
      callbacksRef.current.onLockDenied?.(data.sectionId, data.reason, data.lockedBy);
    };

    const handleLockAcquired = (data: {
      sectionId: string;
      userId: string;
      userName: string;
      expiresAt: number;
    }) => {
      store.setLock({
        sectionId: data.sectionId,
        userId: data.userId,
        userName: data.userName,
        lockedAt: Date.now(),
        expiresAt: data.expiresAt,
      });
    };

    const handleLockReleased = (data: { sectionId: string; userId: string; reason: string }) => {
      store.removeLock(data.sectionId);
      callbacksRef.current.onLockReleased?.(data.sectionId);
    };

    const handleChange = (change: CanvasChange) => {
      // Don't process our own changes
      if (change.userId === userId) return;

      store.addPendingChange(change);
      callbacksRef.current.onChangeReceived?.(change);
    };

    // Register event listeners
    socket.on('canvas:state', handleCanvasState);
    socket.on('canvas:user:joined', handleUserJoined);
    socket.on('canvas:user:left', handleUserLeft);
    socket.on('canvas:cursor:move', handleCursorMove);
    socket.on('canvas:lock:granted', handleLockGranted);
    socket.on('canvas:lock:denied', handleLockDenied);
    socket.on('canvas:lock:acquired', handleLockAcquired);
    socket.on('canvas:lock:released', handleLockReleased);
    socket.on('canvas:change', handleChange);

    // Cleanup
    return () => {
      socket.off('canvas:state', handleCanvasState);
      socket.off('canvas:user:joined', handleUserJoined);
      socket.off('canvas:user:left', handleUserLeft);
      socket.off('canvas:cursor:move', handleCursorMove);
      socket.off('canvas:lock:granted', handleLockGranted);
      socket.off('canvas:lock:denied', handleLockDenied);
      socket.off('canvas:lock:acquired', handleLockAcquired);
      socket.off('canvas:lock:released', handleLockReleased);
      socket.off('canvas:change', handleChange);

      store.leaveCanvas();
    };
  }, [socket, enabled, canvasId, userId, userName, userEmail, userAvatar, store]);

  // Cursor update with throttling
  const lastCursorUpdate = useRef(0);
  const updateMyCursor = useCallback(
    (position: CursorPosition) => {
      const now = Date.now();
      // Throttle cursor updates to 60fps
      if (now - lastCursorUpdate.current < 16) return;
      lastCursorUpdate.current = now;
      store.updateMyCursor(position);
    },
    [store]
  );

  // Get users as array
  const users = Array.from(store.users.values());

  return {
    isConnected,
    users,
    cursors: store.cursors,
    locks: store.locks,

    updateMyCursor,
    requestLock: store.requestLock,
    releaseLock: store.releaseLock,
    isLockedByOther: store.isLockedByOther,
    isLockedByMe: store.isLockedByMe,
    getLockOwner: store.getLockOwner,

    broadcastSectionAdd: store.broadcastSectionAdd,
    broadcastSectionUpdate: store.broadcastSectionUpdate,
    broadcastSectionDelete: store.broadcastSectionDelete,
    broadcastSectionMove: store.broadcastSectionMove,
    broadcastFieldUpdate: store.broadcastFieldUpdate,
  };
};

export default useCanvasCollaboration;

/**
 * CollaborationCursor
 *
 * Displays remote user cursors on the canvas.
 */

import React from 'react';
import type { CanvasUser, CursorPosition } from '@/stores/canvasCollaborationStore';

interface CollaborationCursorProps {
  user: CanvasUser;
  position: CursorPosition;
  containerOffset?: { x: number; y: number };
}

export const CollaborationCursor: React.FC<CollaborationCursorProps> = ({
  user,
  position,
  containerOffset = { x: 0, y: 0 },
}) => {
  const x = position.x - containerOffset.x;
  const y = position.y - containerOffset.y;

  return (
    <div
      className="pointer-events-none absolute z-50 transition-transform duration-75"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: user.color }}
      >
        <path
          d="M5.65376 12.4563L8.12476 12.4563L8.12476 19.7313L5.65376 12.4563Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 4L10 20L12 14L18 12L3 4Z"
          fill="currentColor"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* User name label */}
      <div
        className="ml-4 mt-1 px-2 py-0.5 rounded-md text-xs font-medium text-white whitespace-nowrap shadow-md"
        style={{ backgroundColor: user.color }}
      >
        {user.name}
      </div>
    </div>
  );
};

/**
 * CollaborationCursors
 *
 * Renders all remote user cursors.
 */
interface CollaborationCursorsProps {
  users: CanvasUser[];
  cursors: Map<string, CursorPosition>;
  currentUserId: string;
  containerOffset?: { x: number; y: number };
}

export const CollaborationCursors: React.FC<CollaborationCursorsProps> = ({
  users,
  cursors,
  currentUserId,
  containerOffset,
}) => {
  return (
    <>
      {users
        .filter((user) => user.id !== currentUserId && cursors.has(user.id))
        .map((user) => {
          const position = cursors.get(user.id);
          if (!position) return null;

          return (
            <CollaborationCursor
              key={user.id}
              user={user}
              position={position}
              containerOffset={containerOffset}
            />
          );
        })}
    </>
  );
};

export default CollaborationCursors;

/**
 * CollaborationPresence
 *
 * Displays active collaborators in the canvas.
 */

import React from 'react';
import { Users } from 'lucide-react';
import type { CanvasUser } from '@/stores/canvasCollaborationStore';

interface CollaborationPresenceProps {
  users: CanvasUser[];
  currentUserId: string;
  maxVisible?: number;
}

export const CollaborationPresence: React.FC<CollaborationPresenceProps> = ({
  users,
  currentUserId,
  maxVisible = 5,
}) => {
  // Filter out current user and sort by join time
  const otherUsers = users
    .filter((u) => u.id !== currentUserId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (otherUsers.length === 0) {
    return null;
  }

  const visibleUsers = otherUsers.slice(0, maxVisible);
  const remainingCount = otherUsers.length - maxVisible;

  return (
    <div className="flex items-center gap-2">
      {/* Collaborators label */}
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <Users className="w-3.5 h-3.5" />
        <span>Collaborators:</span>
      </div>

      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {visibleUsers.map((user, index) => (
          <div
            key={user.id}
            className="relative group"
            style={{ zIndex: visibleUsers.length - index }}
          >
            {/* Avatar */}
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 object-cover"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs font-medium text-white"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Online indicator */}
            <span
              className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-gray-800"
              style={{ backgroundColor: '#22c55e' }}
            />

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {user.name}
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"
              />
            </div>
          </div>
        ))}

        {/* Overflow indicator */}
        {remainingCount > 0 && (
          <div className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span>Live</span>
      </div>
    </div>
  );
};

/**
 * CollaborationPresenceMinimal
 *
 * Minimal version showing just avatar stack.
 */
interface CollaborationPresenceMinimalProps {
  users: CanvasUser[];
  currentUserId: string;
  maxVisible?: number;
}

export const CollaborationPresenceMinimal: React.FC<CollaborationPresenceMinimalProps> = ({
  users,
  currentUserId,
  maxVisible = 3,
}) => {
  const otherUsers = users
    .filter((u) => u.id !== currentUserId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (otherUsers.length === 0) {
    return null;
  }

  const visibleUsers = otherUsers.slice(0, maxVisible);
  const remainingCount = otherUsers.length - maxVisible;

  return (
    <div className="flex -space-x-1.5">
      {visibleUsers.map((user, index) => (
        <div
          key={user.id}
          className="w-6 h-6 rounded-full border border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-medium text-white"
          style={{
            backgroundColor: user.color,
            zIndex: visibleUsers.length - index,
          }}
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className="w-6 h-6 rounded-full border border-white dark:border-gray-800 bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-[10px] font-medium text-gray-700 dark:text-gray-200"
          style={{ zIndex: 0 }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

export default CollaborationPresence;

/**
 * Online Users List
 * 
 * Displays list of online users with presence indicators.
 */

import React from 'react';
import { useOnlineUsers } from '../../stores';
import { UserPresenceAvatar } from './UserPresenceAvatar';

interface OnlineUsersListProps {
  className?: string;
  maxDisplay?: number;
}

export const OnlineUsersList: React.FC<OnlineUsersListProps> = ({
  className = '',
  maxDisplay = 10,
}) => {
  const onlineUsers = useOnlineUsers();

  const displayedUsers = onlineUsers.slice(0, maxDisplay);
  const additionalCount = Math.max(0, onlineUsers.length - maxDisplay);

  if (onlineUsers.length === 0) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        No users online
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Online Now
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {onlineUsers.length} {onlineUsers.length === 1 ? 'user' : 'users'}
        </span>
      </div>

      <div className="space-y-2">
        {displayedUsers.map((user) => (
          <UserPresenceAvatar
            key={user.userId}
            userId={user.userId}
            size="sm"
            showName
            showStatus
            className="hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors cursor-pointer"
          />
        ))}
      </div>

      {additionalCount > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 pl-2">
          + {additionalCount} more {additionalCount === 1 ? 'user' : 'users'}
        </div>
      )}
    </div>
  );
};

export default OnlineUsersList;

/**
 * User Presence Avatar
 * 
 * Displays user avatar with online status indicator.
 */

import React from 'react';
import { useUserPresence } from '../../stores';
import { PresenceStatus } from '../../stores/presenceStore';

interface UserPresenceAvatarProps {
  userId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  showStatus?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const indicatorSizeClasses = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
};

const statusColorClasses = {
  [PresenceStatus.ONLINE]: 'bg-green-500',
  [PresenceStatus.AWAY]: 'bg-yellow-500',
  [PresenceStatus.BUSY]: 'bg-red-500',
  [PresenceStatus.OFFLINE]: 'bg-gray-400',
};

const statusTextClasses = {
  [PresenceStatus.ONLINE]: 'text-green-600 dark:text-green-400',
  [PresenceStatus.AWAY]: 'text-yellow-600 dark:text-yellow-400',
  [PresenceStatus.BUSY]: 'text-red-600 dark:text-red-400',
  [PresenceStatus.OFFLINE]: 'text-gray-600 dark:text-gray-400',
};

export const UserPresenceAvatar: React.FC<UserPresenceAvatarProps> = ({
  userId,
  size = 'md',
  showName = false,
  showStatus = true,
  className = '',
}) => {
  const { presence } = useUserPresence(userId);

  if (!presence) {
    return null;
  }

  const initials = presence.userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        {/* Avatar */}
        {presence.userAvatar ? (
          <img
            src={presence.userAvatar}
            alt={presence.userName}
            className={`${sizeClasses[size]} rounded-full object-cover`}
          />
        ) : (
          <div
            className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold`}
          >
            {initials}
          </div>
        )}

        {/* Status indicator */}
        {showStatus && (
          <div
            className={`absolute bottom-0 right-0 ${
              indicatorSizeClasses[size]
            } ${
              statusColorClasses[presence.status]
            } rounded-full border-2 border-white dark:border-gray-900`}
          />
        )}
      </div>

      {/* Name and status text */}
      {showName && (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {presence.userName}
          </span>
          <span className={`text-xs ${statusTextClasses[presence.status]}`}>
            {presence.status.charAt(0).toUpperCase() + presence.status.slice(1)}
          </span>
        </div>
      )}
    </div>
  );
};

export default UserPresenceAvatar;

/**
 * SectionLockBadge
 *
 * Displays a lock indicator on sections being edited by other users.
 */

import React from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { SectionLock } from '@/stores/canvasCollaborationStore';

interface SectionLockBadgeProps {
  lock: SectionLock | undefined;
  isLockedByMe: boolean;
  onRequestLock?: () => void;
  onReleaseLock?: () => void;
  className?: string;
}

export const SectionLockBadge: React.FC<SectionLockBadgeProps> = ({
  lock,
  isLockedByMe,
  onRequestLock,
  onReleaseLock,
  className = '',
}) => {
  if (!lock) {
    // No lock - show lock button if needed
    if (onRequestLock) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestLock();
          }}
          className={`p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
          title="Click to lock for editing"
        >
          <Unlock className="w-3.5 h-3.5" />
        </button>
      );
    }
    return null;
  }

  if (isLockedByMe) {
    // Locked by current user
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReleaseLock?.();
        }}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs ${className}`}
        title="Click to release lock"
      >
        <Lock className="w-3 h-3" />
        <span>Editing</span>
      </button>
    );
  }

  // Locked by another user
  return (
    <div
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs ${className}`}
      title={`Locked by ${lock.userName}`}
    >
      <Lock className="w-3 h-3" />
      <span>{lock.userName}</span>
    </div>
  );
};

/**
 * SectionLockOverlay
 *
 * Full overlay for locked sections.
 */
interface SectionLockOverlayProps {
  lock: SectionLock;
  className?: string;
}

export const SectionLockOverlay: React.FC<SectionLockOverlayProps> = ({
  lock,
  className = '',
}) => {
  return (
    <div
      className={`absolute inset-0 bg-gray-900/20 dark:bg-gray-900/40 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-10 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <Lock className="w-4 h-4 text-amber-500" />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Being edited by <span className="font-medium">{lock.userName}</span>
        </span>
      </div>
    </div>
  );
};

export default SectionLockBadge;

/**
 * Presence Status Selector
 * 
 * Allows user to change their presence status.
 */

import React, { useState } from 'react';
import { usePresence, usePresenceActions } from '../../stores';
import { PresenceStatus } from '../../stores/presenceStore';

interface PresenceStatusSelectorProps {
  className?: string;
}

const statusOptions = [
  { value: PresenceStatus.ONLINE, label: 'Online', icon: '🟢', color: 'text-green-600' },
  { value: PresenceStatus.AWAY, label: 'Away', icon: '🟡', color: 'text-yellow-600' },
  { value: PresenceStatus.BUSY, label: 'Busy', icon: '🔴', color: 'text-red-600' },
  { value: PresenceStatus.OFFLINE, label: 'Offline', icon: '⚫', color: 'text-gray-600' },
];

export const PresenceStatusSelector: React.FC<PresenceStatusSelectorProps> = ({
  className = '',
}) => {
  const { myStatus } = usePresence();
  const { updateMyStatus } = usePresenceActions();
  const [isOpen, setIsOpen] = useState(false);

  const currentStatus = statusOptions.find((s) => s.value === myStatus);

  const handleStatusChange = (status: PresenceStatus) => {
    updateMyStatus(status);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="text-lg">{currentStatus?.icon}</span>
        <span className={`text-sm font-medium ${currentStatus?.color}`}>
          {currentStatus?.label}
        </span>
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <div className="py-1">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    option.value === myStatus
                      ? 'bg-gray-50 dark:bg-gray-700'
                      : ''
                  }`}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span className={option.color}>{option.label}</span>
                  {option.value === myStatus && (
                    <svg
                      className="w-4 h-4 ml-auto text-blue-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PresenceStatusSelector;

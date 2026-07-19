import React from 'react';
import { TabState } from '../types';

interface TabNavigationProps {
  activeTab: TabState['activeTab'];
  setTabState: (key: string, value: unknown) => void;
}

/**
 * Tab Navigation - renders the navigation tabs for different sections of the user activity page
 */
const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, setTabState }) => {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="flex -mb-px overflow-x-auto">
        <button
          onClick={() => setTabState('activeTab', 'overview')}
          className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          User Overview
        </button>
        <button
          onClick={() => setTabState('activeTab', 'sessions')}
          className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'sessions'
              ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Active Sessions
        </button>
        <button
          onClick={() => setTabState('activeTab', 'actions')}
          className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'actions'
              ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Recent Actions
        </button>
      </nav>
    </div>
  );
};

export default TabNavigation;

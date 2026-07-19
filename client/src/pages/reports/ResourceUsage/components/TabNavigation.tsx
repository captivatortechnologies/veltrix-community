import React from 'react';
import { TabState } from '../types';

interface TabNavigationProps {
  /**
   * Currently active tab
   */
  activeTab: TabState['activeTab'];
  
  /**
   * Function to update tab state
   */
  setTabState: (key: string, value: unknown) => void;
}

/**
 * Tab Navigation for Resource Usage
 * Provides navigation between overview and details tabs
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
          Usage Overview
        </button>
        <button
          onClick={() => setTabState('activeTab', 'details')}
          className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'details'
              ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Usage Details
        </button>
      </nav>
    </div>
  );
};

export default TabNavigation;

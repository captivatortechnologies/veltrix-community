import React from 'react';
import { User, TabState } from '../types';

interface FilterToolbarProps {
  users: User[];
  tabState: TabState;
  setTabState: (key: string, value: unknown) => void;
}

/**
 * Filter Toolbar - provides filtering controls for the user activity data
 */
const FilterToolbar: React.FC<FilterToolbarProps> = ({ users, tabState, setTabState }) => {
  const { userFilter, activeOnly, dateRange, activeTab } = tabState;

  return (
    <div className="flex items-center space-x-2">
      <select
        value={userFilter}
        onChange={(e) => setTabState('userFilter', e.target.value)}
        className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
      >
        <option value="">All Users</option>
        {users.map(user => (
          <option key={user.id} value={user.id}>{user.name}</option>
        ))}
      </select>
      
      <select
        value={dateRange}
        onChange={(e) => setTabState('dateRange', e.target.value as '24h' | '7d' | '30d' | 'all')}
        className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
      >
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="all">All Time</option>
      </select>
      
      {activeTab === 'sessions' && (
        <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setTabState('activeOnly', e.target.checked)}
            className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
          />
          Active Only
        </label>
      )}
    </div>
  );
};

export default FilterToolbar;

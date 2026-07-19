import React from 'react';
import { TabState } from '../types';

interface FilterToolbarProps {
  /**
   * Tenant data for the dropdown
   */
  tenants: Array<{ id: string; name: string }>;
  
  /**
   * Resource types for the dropdown
   */
  resourceTypes: string[];
  
  /**
   * Current tab state
   */
  tabState: TabState;
  
  /**
   * Function to update tab state
   */
  setTabState: (key: string, value: unknown) => void;
}

/**
 * Filter Toolbar for Resource Usage
 * Provides filtering controls for the resource usage data
 */
const FilterToolbar: React.FC<FilterToolbarProps> = ({ 
  tenants,
  resourceTypes,
  tabState,
  setTabState
}) => {
  const { activeTab, tenant, resourceType, timeRange } = tabState;

  return (
    <div className="flex items-center space-x-2">
      <select
        value={tenant}
        onChange={(e) => setTabState('tenant', e.target.value)}
        className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
      >
        <option value="">All Tenants</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      
      {activeTab === 'details' && (
        <select
          value={resourceType}
          onChange={(e) => setTabState('resourceType', e.target.value)}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
        >
          <option value="">All Resource Types</option>
          {resourceTypes.map(type => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      )}
      
      <select
        value={timeRange}
        onChange={(e) => setTabState('timeRange', e.target.value as '24h' | '7d' | '30d')}
        className="px-3 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md text-sm text-gray-700 dark:text-gray-200"
      >
        <option value="24h">Last 24 Hours</option>
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
      </select>
    </div>
  );
};

export default FilterToolbar;

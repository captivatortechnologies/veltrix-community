/**
 * VersionFilters Component
 * Filter controls for version history
 */

import { memo, useState } from 'react';
import {
  Filter,
  X,
  Search,
  Calendar,
  User,
  FileText,
  ChevronDown,
} from 'lucide-react';
import type { VersionFiltersProps, ConfigActionType, DeployState } from '../types';
import { getActionLabel, getDeployStateLabel, formatEntityType } from '../utils/formatUtils';

const ACTION_TYPES: ConfigActionType[] = [
  'CREATED',
  'UPDATED',
  'DELETED',
  'APPROVED',
  'REJECTED',
  'DEPLOYED',
  'REVERTED',
];

const DEPLOY_STATES: DeployState[] = [
  'pending_approval',
  'approved',
  'rejected',
  'deployed',
  'draft',
];

function VersionFiltersComponent({
  filters,
  onFiltersChange,
  availableEntityTypes = [],
  availableUsers = [],
  className = '',
}: VersionFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = [
    filters.action?.length,
    filters.entityType?.length,
    filters.userId,
    filters.startDate,
    filters.endDate,
    filters.deployState?.length,
    filters.searchTerm,
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const toggleArrayFilter = <T extends string>(
    key: 'action' | 'entityType' | 'deployState',
    value: T
  ) => {
    const current = (filters[key] as T[] | undefined) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated.length > 0 ? updated : undefined);
  };

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
            Clear all
          </button>
        )}
      </div>

      {/* Quick search (always visible) */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by entity name or message..."
            value={filters.searchTerm || ''}
            onChange={(e) => updateFilter('searchTerm', e.target.value || undefined)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Action types */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <FileText className="h-4 w-4" />
              Action Type
            </label>
            <div className="flex flex-wrap gap-2">
              {ACTION_TYPES.map((action) => (
                <button
                  key={action}
                  onClick={() => toggleArrayFilter('action', action)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    filters.action?.includes(action)
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {getActionLabel(action)}
                </button>
              ))}
            </div>
          </div>

          {/* Entity types */}
          {availableEntityTypes.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FileText className="h-4 w-4" />
                Entity Type
              </label>
              <div className="flex flex-wrap gap-2">
                {availableEntityTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleArrayFilter('entityType', type)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      filters.entityType?.includes(type)
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    {formatEntityType(type)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deploy state */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {DEPLOY_STATES.map((state) => (
                <button
                  key={state}
                  onClick={() => toggleArrayFilter('deployState', state)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    filters.deployState?.includes(state)
                      ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {getDeployStateLabel(state)}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="h-4 w-4" />
                From Date
              </label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="h-4 w-4" />
                To Date
              </label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* User filter */}
          {availableUsers.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="h-4 w-4" />
                User
              </label>
              <select
                value={filters.userId || ''}
                onChange={(e) => updateFilter('userId', e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All users</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const VersionFilters = memo(VersionFiltersComponent);

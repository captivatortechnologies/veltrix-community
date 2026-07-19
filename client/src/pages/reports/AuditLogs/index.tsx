import React, { useState, useRef, useMemo } from 'react';
import ReportPage from '@/components/reports/ReportPage';
import { ReportStatus } from '@/components/reports/ReportStatus';
import VirtualList from '@/components/VirtualList';
import type { VirtualListProps } from '@/components/VirtualList';
import { useAuditLogsReport } from '@/services/reportsService';
import type { AuditLog, LogFilterOptions } from './types';
import { formatDate } from './utils';

/**
 * VirtualList is exported through `forwardRef`, which erases its item generic
 * to `unknown` (so `renderItem` would receive untyped rows). Re-bind the
 * component to `AuditLog` for this page; this is sound because the `items`
 * prop we pass (`filteredLogs`) is a typed `AuditLog[]`.
 */
const AuditLogVirtualList = VirtualList as unknown as React.ComponentType<VirtualListProps<AuditLog>>;

/**
 * Audit Logs Page
 * Displays audit logs with filtering and pagination
 */
const AuditLogsPage: React.FC = () => {
  const query = useAuditLogsReport();

  // Filter state
  const [filters, setFilters] = useState<LogFilterOptions>({
    userId: '',
    action: '',
    resourceType: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  // Search term
  const [searchTerm, setSearchTerm] = useState('');

  // Reference to content for export
  const contentRef = useRef<HTMLDivElement>(null);

  // Real audit log data + filter option lists from the API
  const logs = query.data?.logs ?? [];
  const users = query.data?.users ?? [];
  const actions = query.data?.actions ?? [];
  const resourceTypes = query.data?.resourceTypes ?? [];

  // Apply filters with useMemo for performance
  const filteredLogs = useMemo(() => logs.filter(log => {
    // Filter by user
    if (filters.userId && log.userId !== filters.userId) {
      return false;
    }

    // Filter by action
    if (filters.action && log.action !== filters.action) {
      return false;
    }

    // Filter by resource type
    if (filters.resourceType && log.resourceType !== filters.resourceType) {
      return false;
    }

    // Filter by status
    if (filters.status && log.status !== filters.status) {
      return false;
    }

    // Filter by date from
    if (filters.dateFrom && new Date(log.timestamp) < new Date(filters.dateFrom)) {
      return false;
    }

    // Filter by date to
    if (filters.dateTo && new Date(log.timestamp) > new Date(filters.dateTo)) {
      return false;
    }

    // Filter by search term (across multiple fields)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        log.userName.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        log.resourceType.toLowerCase().includes(searchLower) ||
        (log.resourceName && log.resourceName.toLowerCase().includes(searchLower)) ||
        log.ipAddress.includes(searchTerm)
      );
    }

    return true;
  }), [logs, filters, searchTerm]);

  // Reset filters
  const resetFilters = () => {
    setFilters({
      userId: '',
      action: '',
      resourceType: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    });
    setSearchTerm('');
  };

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Prepare export data
  const getExportData = (): Record<string, unknown>[] => {
    return filteredLogs.map(log => ({
      timestamp: formatDate(log.timestamp),
      userName: log.userName,
      userId: log.userId,
      action: log.action,
      resourceType: log.resourceType,
      resourceName: log.resourceName || '',
      status: log.status,
      ipAddress: log.ipAddress,
      location: log.location || '',
      details: log.details || ''
    }));
  };

  return (
    <ReportPage
      title="Audit Logs"
      exportData={getExportData()}
      contentSelector="#audit-logs-content"
    >
      <div id="audit-logs-content" ref={contentRef}>
        <ReportStatus
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={query.refetch}
          isEmpty={(query.data?.logs.length ?? 0) === 0}
          emptyMessage="No audit activity recorded yet."
        >
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Filters</h3>
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Reset Filters
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* User filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  User
                </label>
                <select
                  name="userId"
                  value={filters.userId}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                >
                  <option value="">All Users</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>

              {/* Action filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Action
                </label>
                <select
                  name="action"
                  value={filters.action}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                >
                  <option value="">All Actions</option>
                  {actions.map(action => (
                    <option key={action} value={action}>{action.charAt(0).toUpperCase() + action.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Resource Type filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Resource Type
                </label>
                <select
                  name="resourceType"
                  value={filters.resourceType}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                >
                  <option value="">All Resource Types</option>
                  {resourceTypes.map(type => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="failure">Failure</option>
                </select>
              </div>

              {/* Date From filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  name="dateFrom"
                  value={filters.dateFrom}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                />
              </div>

              {/* Date To filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  name="dateTo"
                  value={filters.dateTo}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
                />
              </div>
            </div>

            {/* Search */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search logs..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700"
              />
            </div>

            {/* Results summary */}
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Showing {filteredLogs.length} results
            </div>
          </div>

          {/* Audit Logs Table with Virtual Scrolling */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-50 dark:bg-gray-700">
              <div className="grid grid-cols-6 gap-4 px-6 py-3">
                <div className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </div>
                <div className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </div>
                <div className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Action
                </div>
                <div className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Resource
                </div>
                <div className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </div>
                <div className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  IP Address
                </div>
              </div>
            </div>

            {/* Virtual List */}
            {filteredLogs.length > 0 ? (
              <AuditLogVirtualList
                items={filteredLogs}
                itemHeight={88} // Approximate height of each row (py-4 + content)
                height={600} // Height of the scrollable container
                renderItem={(log) => (
                  <div className="grid grid-cols-6 gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(log.timestamp)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{log.userName}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{log.userId}</div>
                    </div>
                    <div>
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {log.action.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{log.resourceType}</div>
                      {log.resourceName && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">{log.resourceName}</div>
                      )}
                    </div>
                    <div>
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        log.status === 'success'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : log.status === 'warning'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                      {log.details && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{log.details}</div>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                      <div>{log.ipAddress}</div>
                      <div className="text-xs">{log.location}</div>
                    </div>
                  </div>
                )}
                emptyComponent={
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">No audit logs found</p>
                  </div>
                }
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No audit logs found</p>
              </div>
            )}
          </div>
        </ReportStatus>
      </div>
    </ReportPage>
  );
};

export default AuditLogsPage;

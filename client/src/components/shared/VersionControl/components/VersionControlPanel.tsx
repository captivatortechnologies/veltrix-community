/**
 * VersionControlPanel Component
 * Main container component that combines all version control features
 */

import { memo, useState, useCallback } from 'react';
import {
  GitBranch,
  History,
  Clock,
  RefreshCw,
  Download,
} from 'lucide-react';
import type {
  VersionControlPanelProps,
  VersionEntry,
} from '../types';
import { useVersionControl } from '../hooks/useVersionControl';
import { VersionTimeline } from './VersionTimeline';
import { PendingApprovals } from './PendingApprovals';
import { VersionFilters } from './VersionFilters';
import { VersionDetailModal } from './VersionDetailModal';
import { VersionCompareModal } from './VersionCompareModal';
import { entriesToCSV, entriesToJSON } from '../utils/formatUtils';

type TabType = 'history' | 'approvals';

function VersionControlPanelComponent({
  entityType,
  entityId,
  title = 'Version Control',
  showApprovals = true,
  showTimeline = true,
  showFilters = true,
  showCompare = true,
  showExport = true,
  defaultTab = 'history',
  maxHeight,
  onEntryClick,
  onApprove,
  onReject,
  onRevert,
  className = '',
  customDiffTabs,
  defaultDiffView,
}: VersionControlPanelProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  // Use the version control hook for real data
  const {
    history: historyEntries,
    pendingApprovals: pendingApprovalsData,
    isLoading,
    filters,
    setFilters,
    refetch,
  } = useVersionControl({
    entityType,
    entityId,
  });

  // Modal state
  const [selectedEntry, setSelectedEntry] = useState<VersionEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareFromVersion, setCompareFromVersion] = useState<VersionEntry | null>(null);
  const [compareToVersion, setCompareToVersion] = useState<VersionEntry | null>(null);

  // Get unique entity types for filter
  const availableEntityTypes = Array.from(
    new Set(historyEntries.map((e) => e.entityType))
  );

  // Get unique users for filter
  const availableUsers = Array.from(
    new Map(historyEntries.map((e) => [e.user.id, e.user])).values()
  );

  // Filter entries (client-side additional filtering if needed)
  const filteredEntries = historyEntries.filter((entry) => {
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const matchesName = entry.entityName?.toLowerCase().includes(term);
      const matchesMessage = entry.details.message?.toLowerCase().includes(term);
      if (!matchesName && !matchesMessage) {
        return false;
      }
    }
    return true;
  });

  // Handlers
  const handleEntryClick = useCallback((entry: VersionEntry) => {
    setSelectedEntry(entry);
    setIsDetailModalOpen(true);
    onEntryClick?.(entry);
  }, [onEntryClick]);

  const handleCompare = useCallback((entry1: VersionEntry, entry2: VersionEntry) => {
    setCompareFromVersion(entry1);
    setCompareToVersion(entry2);
    setIsCompareModalOpen(true);
  }, []);

  const handleSwapVersions = useCallback(() => {
    setCompareFromVersion(compareToVersion);
    setCompareToVersion(compareFromVersion);
  }, [compareFromVersion, compareToVersion]);

  const handleRevert = async (versionId: string) => {
    const entry = historyEntries.find(e => e.id === versionId);
    if (entry && onRevert) {
      await onRevert(entry);
    }
    setIsDetailModalOpen(false);
  };

  const handleApprove = async (id: string) => {
    const entry = pendingApprovalsData.find(e => e.id === id);
    if (entry && onApprove) {
      await onApprove(entry);
    }
  };

  const handleReject = async (id: string, reason?: string) => {
    const entry = pendingApprovalsData.find(e => e.id === id);
    if (entry && onReject) {
      await onReject(entry, reason);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const data = format === 'csv' ? entriesToCSV(filteredEntries) : entriesToJSON(filteredEntries);
    const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `version-history-${entityType}${entityId ? `-${entityId}` : ''}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div
      className={`w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}
      style={maxHeight ? { maxHeight, overflow: 'auto' } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <GitBranch className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track changes, compare versions, and manage approvals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          {showExport && (
            <div className="relative group">
              <button
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 last:rounded-b-lg"
                >
                  Export JSON
                </button>
              </div>
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {showApprovals && showTimeline && (
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <History className="h-4 w-4" />
            History
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800">
              {filteredEntries.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'approvals'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Clock className="h-4 w-4" />
            Pending Approvals
            {pendingApprovalsData.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                {pendingApprovalsData.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="w-full">
        {/* Filters (only for history tab) */}
        {showFilters && activeTab === 'history' && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <VersionFilters
              filters={filters}
              onFiltersChange={setFilters}
              availableEntityTypes={availableEntityTypes}
              availableUsers={availableUsers}
            />
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'history' && showTimeline && (
          <VersionTimeline
            entries={filteredEntries}
            isLoading={isLoading}
            onEntryClick={handleEntryClick}
            onCompare={showCompare ? handleCompare : undefined}
            className="border-0 rounded-none"
          />
        )}

        {activeTab === 'approvals' && showApprovals && (
          <PendingApprovals
            entries={pendingApprovalsData}
            isLoading={isLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDetails={handleEntryClick}
            className="border-0 rounded-none"
          />
        )}

        {/* Only timeline (no tabs) */}
        {!showApprovals && showTimeline && (
          <>
            {showFilters && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <VersionFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableEntityTypes={availableEntityTypes}
                  availableUsers={availableUsers}
                />
              </div>
            )}
            <VersionTimeline
              entries={filteredEntries}
              isLoading={isLoading}
              onEntryClick={handleEntryClick}
              onCompare={showCompare ? handleCompare : undefined}
              className="border-0 rounded-none"
            />
          </>
        )}

        {/* Only approvals (no tabs) */}
        {showApprovals && !showTimeline && (
          <PendingApprovals
            entries={pendingApprovalsData}
            isLoading={isLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDetails={handleEntryClick}
            className="border-0 rounded-none"
          />
        )}
      </div>

      {/* Modals */}
      <VersionDetailModal
        entry={selectedEntry}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onRevert={onRevert ? handleRevert : undefined}
        onCompare={showCompare ? (entry) => {
          setIsDetailModalOpen(false);
          setCompareFromVersion(entry);
          // TODO: Open version selector for comparison
        } : undefined}
        onApprove={onApprove ? async (entryId, _comment) => {
          await handleApprove(entryId);
          // TODO: Pass _comment to approve handler when backend supports it
        } : undefined}
        onReject={onReject ? async (entryId, reason) => {
          await handleReject(entryId, reason);
        } : undefined}
        customDiffTabs={customDiffTabs}
        defaultDiffView={defaultDiffView}
      />

      <VersionCompareModal
        fromVersion={compareFromVersion}
        toVersion={compareToVersion}
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        onSwapVersions={handleSwapVersions}
        customDiffTabs={customDiffTabs}
        defaultDiffView={defaultDiffView}
      />
    </div>
  );
}

export const VersionControlPanel = memo(VersionControlPanelComponent);

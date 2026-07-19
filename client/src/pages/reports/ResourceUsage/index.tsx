import React, { useState, useCallback, useRef } from 'react';
import TabStateManager from '@/components/reports/TabStateManager';
import ReportPage from '@/components/reports/ReportPage';
import { ReportStatus } from '@/components/reports/ReportStatus';
import { useResourceUsageReport } from '@/services/reportsService';
import {
  TabState,
  URL_PARAM_MAPPING
} from './types';
import {
  filterResourceUsage
} from './utils';

// Component imports
import FilterToolbar from './components/FilterToolbar';
import TabNavigation from './components/TabNavigation';
import OverviewTab from './components/OverviewTab';
import DetailsTab from './components/DetailsTab';

/**
 * Resource Usage Page - displays tenant resource usage with filtering options
 * and tab-based navigation between different views
 */
const ResourceUsagePage: React.FC = () => {
  // Real report data. NOTE: this report is tenant-scoped, so `summaries`/
  // `tenants` will typically contain exactly one entry (the caller's tenant) —
  // that is expected, not a bug.
  const query = useResourceUsageReport();
  const usage = query.data?.usage ?? [];
  const summaries = query.data?.summaries ?? [];
  const tenants = query.data?.tenants ?? [];
  const resourceTypes = query.data?.resourceTypes ?? [];

  // State for tab management that we want to persist in URL
  const [tabState, setTabStateObj] = useState<TabState>({
    activeTab: 'overview',
    tenant: '',
    resourceType: '',
    timeRange: '7d'
  });

  // Helper function to update a specific key in the tab state
  const setTabState = useCallback((key: string, value: unknown) => {
    setTabStateObj(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  // Destructure the state for easier access in the component
  const { activeTab, tenant, resourceType, timeRange } = tabState;

  // Filter resource usage data
  const filteredUsage = filterResourceUsage(
    usage,
    tenant,
    resourceType,
    timeRange
  );

  // Filter tenant summaries
  const filteredSummaries = tenant
    ? summaries.filter(summary => summary.tenantId === tenant)
    : summaries;

  // Calculate total costs and usage across all filtered tenants
  const totalCost = filteredSummaries.reduce((sum, summary) => sum + summary.totalCost, 0);
  const totalCompute = filteredSummaries.reduce((sum, summary) => sum + summary.computeUsage, 0);
  const totalStorage = filteredSummaries.reduce((sum, summary) => sum + summary.storageUsage, 0);
  const totalNetwork = filteredSummaries.reduce((sum, summary) => sum + summary.networkUsage, 0);

  // Reference to content for export
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Prepare export data based on active tab
  const getExportData = (): Record<string, unknown>[] => {
    // Use type assertion to satisfy TypeScript
    switch (activeTab) {
      case 'overview':
        return filteredSummaries as unknown as Record<string, unknown>[];
      case 'details':
        return filteredUsage as unknown as Record<string, unknown>[];
      default:
        return [] as Record<string, unknown>[];
    }
  };
  
  return (
    <TabStateManager
      tabState={tabState}
      setTabState={setTabState}
      urlParamMapping={URL_PARAM_MAPPING}
    >
      <ReportPage
        title="Resource Usage"
        exportData={getExportData()}
        contentSelector="#resource-usage-content"
        actions={
          <FilterToolbar 
            tenants={tenants}
            resourceTypes={resourceTypes}
            tabState={tabState}
            setTabState={setTabState}
          />
        }
      >
        {/* Tab Navigation */}
        <TabNavigation
          activeTab={activeTab}
          setTabState={setTabState}
        />

        <ReportStatus
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={query.refetch}
          isEmpty={(query.data?.usage.length ?? 0) === 0}
          emptyMessage="No resource usage recorded yet."
        >
          {/* Tab Content */}
          <div id="resource-usage-content" ref={contentRef}>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <OverviewTab
                filteredSummaries={filteredSummaries}
                totalCost={totalCost}
                totalCompute={totalCompute}
                totalStorage={totalStorage}
                totalNetwork={totalNetwork}
              />
            )}

            {/* Details Tab */}
            {activeTab === 'details' && (
              <DetailsTab
                filteredUsage={filteredUsage}
              />
            )}
          </div>
        </ReportStatus>
      </ReportPage>
    </TabStateManager>
  );
};

export default ResourceUsagePage;

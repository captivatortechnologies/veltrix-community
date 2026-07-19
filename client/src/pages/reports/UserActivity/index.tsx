import React, { useState, useCallback, useRef } from 'react';
import TabStateManager from '@/components/reports/TabStateManager';
import ReportPage from '@/components/reports/ReportPage';
import { ReportStatus } from '@/components/reports/ReportStatus';
import { useUserActivityReport } from '@/services/reportsService';
import { TabState, URL_PARAM_MAPPING } from './types';
import { filterSessions, filterActions } from './utils';

// Component imports
import FilterToolbar from './components/FilterToolbar';
import TabNavigation from './components/TabNavigation';
import UserOverviewTab from './components/UserOverviewTab';
import SessionsTab from './components/SessionsTab';
import ActionsTab from './components/ActionsTab';

/**
 * User Activity Page - displays user activity data with filtering options
 * and tab-based navigation between different views
 */
const UserActivityPage: React.FC = () => {
  // Fetch real user activity data from the reports API
  const query = useUserActivityReport();

  // State for tab management that we want to persist in URL
  const [tabState, setTabStateObj] = useState<TabState>({
    activeTab: 'overview',
    userFilter: '',
    activeOnly: false,
    dateRange: '7d'
  });

  // Helper function to update a specific key in the tab state
  const setTabState = useCallback((key: string, value: unknown) => {
    setTabStateObj(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  // Destructure the state for easier access in the component
  const { activeTab, userFilter, activeOnly, dateRange } = tabState;

  // Real data from the API, defaulting to empty arrays while loading/erroring
  const userStats = query.data?.userStats ?? [];
  const sessions = query.data?.sessions ?? [];
  const actions = query.data?.actions ?? [];
  const users = query.data?.users ?? [];

  // Filter sessions based on current filters
  const filteredSessions = filterSessions(sessions, userFilter, activeOnly, dateRange);

  // Filter actions based on user filter and date range
  const filteredActions = filterActions(actions, userFilter, dateRange);

  // Reference to content for export
  const contentRef = useRef<HTMLDivElement>(null);

  // Prepare export data based on active tab
  const getExportData = (): Record<string, unknown>[] => {
    // Use type assertion to satisfy TypeScript
    switch (activeTab) {
      case 'overview':
        return (userFilter
          ? userStats.filter(user => user.userId === userFilter)
          : userStats) as unknown as Record<string, unknown>[];
      case 'sessions':
        return filteredSessions as unknown as Record<string, unknown>[];
      case 'actions':
        return filteredActions as unknown as Record<string, unknown>[];
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
        title="User Activity"
        exportData={getExportData()}
        contentSelector="#user-activity-content"
        actions={
          <FilterToolbar 
            users={users}
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

        {/* Tab Content */}
        <div id="user-activity-content" ref={contentRef}>
          <ReportStatus
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={query.refetch}
          >
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <UserOverviewTab
                userStats={userStats}
                userFilter={userFilter}
              />
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <SessionsTab
                sessions={filteredSessions}
              />
            )}

            {/* Actions Tab */}
            {activeTab === 'actions' && (
              <ActionsTab
                actions={filteredActions}
              />
            )}
          </ReportStatus>
        </div>
      </ReportPage>
    </TabStateManager>
  );
};

export default UserActivityPage;

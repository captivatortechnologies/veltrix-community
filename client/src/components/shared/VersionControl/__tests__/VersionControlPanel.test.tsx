/**
 * Unit tests for VersionControlPanel component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VersionControlPanel } from '../components/VersionControlPanel';

// Mock the useVersionControl hook
vi.mock('../hooks/useVersionControl', () => ({
  useVersionControl: vi.fn(() => ({
    history: [],
    pendingApprovals: [],
    isLoading: false,
    error: null,
    filters: {},
    setFilters: vi.fn(),
    pagination: { page: 1, limit: 50 },
    setPagination: vi.fn(),
    totalEntries: 0,
    refetch: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    revert: vi.fn(),
  })),
}));

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe('VersionControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default title', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" />
      );

      expect(screen.getByText('Version Control')).toBeInTheDocument();
    });

    it('should render with custom title', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" title="Configuration History" />
      );

      expect(screen.getByText('Configuration History')).toBeInTheDocument();
    });

    it('should render subtitle text', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" />
      );

      expect(screen.getByText('Track changes, compare versions, and manage approvals')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('should show both tabs when showApprovals and showTimeline are true', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={true}
          showTimeline={true}
        />
      );

      expect(screen.getByText('History')).toBeInTheDocument();
      expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    });

    it('should default to history tab', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={true}
          showTimeline={true}
        />
      );

      const historyTab = screen.getByText('History').closest('button');
      expect(historyTab).toHaveClass('border-blue-600');
    });

    it('should default to approvals tab when defaultTab is approvals', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={true}
          showTimeline={true}
          defaultTab="approvals"
        />
      );

      // Find the tab button (not the h3 header)
      const approvalsTab = screen.getAllByText('Pending Approvals')
        .find(el => el.closest('button'));
      expect(approvalsTab?.closest('button')).toHaveClass('border-blue-600');
    });

    it('should switch tabs when clicked', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={true}
          showTimeline={true}
        />
      );

      const approvalsTab = screen.getByText('Pending Approvals').closest('button');
      fireEvent.click(approvalsTab!);

      expect(approvalsTab).toHaveClass('border-blue-600');
    });

    it('should not show tabs when only timeline is enabled', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={false}
          showTimeline={true}
        />
      );

      expect(screen.queryByText('Pending Approvals')).not.toBeInTheDocument();
    });

    it('should not show tabs when only approvals is enabled', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showApprovals={true}
          showTimeline={false}
        />
      );

      expect(screen.queryByRole('button', { name: /History/i })).not.toBeInTheDocument();
    });
  });

  describe('Export', () => {
    it('should show export button when showExport is true', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" showExport={true} />
      );

      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('should hide export button when showExport is false', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" showExport={false} />
      );

      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });
  });

  describe('Refresh', () => {
    it('should have a refresh button', () => {
      renderWithProviders(
        <VersionControlPanel entityType="INDEX" />
      );

      // Find the refresh button by its icon (RefreshCw is in a button)
      const refreshButtons = screen.getAllByRole('button');
      const refreshButton = refreshButtons.find(btn =>
        btn.querySelector('svg.lucide-refresh-cw') !== null
      );

      expect(refreshButton).toBeDefined();
    });
  });

  describe('Empty States', () => {
    it('should show empty state when no history entries', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showTimeline={true}
          showApprovals={false}
        />
      );

      // The VersionTimeline shows "No history yet" for empty state
      // Use getAllByText as the filter dropdown might also show this
      const emptyStateMessages = screen.getAllByText('No history yet');
      expect(emptyStateMessages.length).toBeGreaterThan(0);
    });

    it('should show empty state when no pending approvals', () => {
      renderWithProviders(
        <VersionControlPanel
          entityType="INDEX"
          showTimeline={false}
          showApprovals={true}
        />
      );

      // The PendingApprovals component shows "All caught up!" and "No pending approvals at this time"
      expect(screen.getByText('All caught up!')).toBeInTheDocument();
    });
  });

  describe('Custom class', () => {
    it('should apply custom className', () => {
      const { container } = renderWithProviders(
        <VersionControlPanel entityType="INDEX" className="custom-class" />
      );

      const panel = container.firstChild;
      expect(panel).toHaveClass('custom-class');
    });
  });
});

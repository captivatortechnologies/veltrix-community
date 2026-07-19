/**
 * useVersionControl Hook
 * Main hook for fetching and managing version control data
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { versionControlApi } from '../api/versionControlApi';
import type {
  VersionFilters,
  PaginationParams,
  UseVersionControlReturn,
} from '../types';

interface UseVersionControlOptions {
  entityType: string;
  entityId?: string;
  enabled?: boolean;
  refetchInterval?: number;
}

export function useVersionControl({
  entityType,
  entityId,
  enabled = true,
  refetchInterval,
}: UseVersionControlOptions): UseVersionControlReturn {
  const queryClient = useQueryClient();

  // Filter state
  const [filters, setFilters] = useState<VersionFilters>({});

  // Pagination state
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    limit: 50,
  });

  // Merge entityType and entityId into filters for API calls
  // If entityType is empty string, don't filter by entityType (show all)
  const mergedFilters: VersionFilters = {
    ...filters,
    entityType: entityType ? [entityType] : undefined,
    entityId: entityId || filters.entityId,
  };

  // Query keys
  const historyQueryKey = ['version-control', 'history', entityType, entityId, filters, pagination];
  const approvalsQueryKey = ['version-control', 'approvals', entityType, entityId];

  // Fetch history
  const {
    data: historyData,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => versionControlApi.getHistory(mergedFilters, pagination),
    enabled,
    refetchInterval,
  });

  // Fetch pending approvals
  const {
    data: approvalsData,
    isLoading: isLoadingApprovals,
    error: approvalsError,
    refetch: refetchApprovals,
  } = useQuery({
    queryKey: approvalsQueryKey,
    queryFn: () => versionControlApi.getPendingApprovals(entityType || undefined, entityId),
    enabled,
    refetchInterval,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (versionId: string) => versionControlApi.approve(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['version-control'] });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ versionId, reason }: { versionId: string; reason?: string }) =>
      versionControlApi.reject(versionId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['version-control'] });
    },
  });

  // Revert mutation
  const revertMutation = useMutation({
    mutationFn: (versionId: string) => versionControlApi.revert(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['version-control'] });
    },
  });

  // Combined loading and error states
  const isLoading = isLoadingHistory || isLoadingApprovals;
  const error = historyError || approvalsError;

  // Handlers
  const approve = useCallback(async (id: string) => {
    await approveMutation.mutateAsync(id);
  }, [approveMutation]);

  const reject = useCallback(async (id: string, reason?: string) => {
    await rejectMutation.mutateAsync({ versionId: id, reason });
  }, [rejectMutation]);

  const revert = useCallback(async (versionId: string) => {
    await revertMutation.mutateAsync(versionId);
  }, [revertMutation]);

  const refetch = useCallback(() => {
    refetchHistory();
    refetchApprovals();
  }, [refetchHistory, refetchApprovals]);

  return {
    history: historyData?.data || [],
    pendingApprovals: approvalsData || [],
    isLoading,
    error: error as Error | null,
    filters,
    setFilters,
    pagination,
    setPagination,
    totalEntries: historyData?.total || 0,
    refetch,
    approve,
    reject,
    revert,
  };
}

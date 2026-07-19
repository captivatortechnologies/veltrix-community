/**
 * useVersionFilters Hook
 * Hook for managing filter state for version history
 */

import { useState, useCallback, useMemo } from 'react';
import type { VersionFilters, UseVersionFiltersReturn } from '../types';

const initialFilters: VersionFilters = {};

export function useVersionFilters(
  initialState: VersionFilters = initialFilters
): UseVersionFiltersReturn {
  const [filters, setFiltersState] = useState<VersionFilters>(initialState);

  const setFilters = useCallback((newFilters: VersionFilters) => {
    setFiltersState(newFilters);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== '';
    });
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== '';
    }).length;
  }, [filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,
    activeFilterCount,
  };
}

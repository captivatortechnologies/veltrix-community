/**
 * useVersionDiff Hook
 * Hook for computing and managing diffs between versions
 */

import { useState, useCallback, useMemo } from 'react';
import type { VersionEntry, VersionDiff, UseVersionDiffReturn } from '../types';
import { computeVersionDiff } from '../utils/diffUtils';

export function useVersionDiff(): UseVersionDiffReturn {
  const [fromVersion, setFromVersion] = useState<VersionEntry | null>(null);
  const [toVersion, setToVersion] = useState<VersionEntry | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Compute diff when both versions are set
  const diff = useMemo<VersionDiff | null>(() => {
    if (!fromVersion || !toVersion) return null;

    try {
      return computeVersionDiff(fromVersion, toVersion);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to compute diff'));
      return null;
    }
  }, [fromVersion, toVersion]);

  const computeDiff = useCallback((from: VersionEntry, to: VersionEntry) => {
    setIsComputing(true);
    setError(null);

    try {
      setFromVersion(from);
      setToVersion(to);
    } finally {
      setIsComputing(false);
    }
  }, []);

  const clearDiff = useCallback(() => {
    setFromVersion(null);
    setToVersion(null);
    setError(null);
  }, []);

  return {
    diff,
    isComputing,
    error,
    computeDiff,
    clearDiff,
  };
}

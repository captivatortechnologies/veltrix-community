/**
 * Diff Computation Utilities
 * Algorithms for computing differences between objects and values
 */

import type {
  DiffChange,
  DiffChangeType,
  DiffSummary,
  VersionEntry,
  VersionDiff,
} from '../types';

// ============================================================================
// Internal Fields Filter
// ============================================================================

/**
 * Fields that should be filtered out from diff display
 * These are internal/system fields that shouldn't be shown to users
 */
export const INTERNAL_FIELDS = new Set([
  'id',
  'customerId',
  'defaultConfigId',
  'createdBy',
  'createdAt',
  'updatedAt',
  'oldValue',
  'newValue',
  'changedFields',
  'message',
  'deployState', // Already shown as a badge
  'tagId',
  'userId',
  'configId',
]);

/**
 * Filter out internal fields from an object (recursively)
 */
export function filterInternalFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const filtered: Partial<T> = {};
  // Object.keys is typed string[], but every key of obj is a keyof T
  const keys = Object.keys(obj) as Array<keyof T & string>;
  for (const key of keys) {
    if (!INTERNAL_FIELDS.has(key)) {
      const value = obj[key];
      // Recursively filter nested objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        filtered[key] = filterInternalFields(value as Record<string, unknown>) as T[keyof T & string];
      } else if (Array.isArray(value)) {
        // Filter arrays of objects
        filtered[key] = value.map(item =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
            ? filterInternalFields(item as Record<string, unknown>)
            : item
        ) as T[keyof T & string];
      } else {
        filtered[key] = value;
      }
    }
  }
  return filtered;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

// ============================================================================
// Value Comparison
// ============================================================================

/**
 * Deep equality check for two values
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

// ============================================================================
// Diff Computation
// ============================================================================

/**
 * Compute the difference between two values
 */
export function computeDiff(
  oldValue: unknown,
  newValue: unknown,
  field: string = 'root',
  path: string[] = []
): DiffChange {
  const currentPath = [...path, field];

  // Both null/undefined
  if (oldValue == null && newValue == null) {
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: 'unchanged',
    };
  }

  // Added (old is null/undefined, new has value)
  if (oldValue == null && newValue != null) {
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: 'added',
      children: isObject(newValue) ? computeObjectDiff({}, newValue, currentPath) : undefined,
    };
  }

  // Removed (old has value, new is null/undefined)
  if (oldValue != null && newValue == null) {
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: 'removed',
      children: isObject(oldValue) ? computeObjectDiff(oldValue, {}, currentPath) : undefined,
    };
  }

  // Type changed
  if (typeof oldValue !== typeof newValue) {
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: 'modified',
    };
  }

  // Both are arrays
  if (isArray(oldValue) && isArray(newValue)) {
    const arrayChanges = computeArrayDiff(oldValue, newValue, field, currentPath);
    const hasChanges = arrayChanges.some((c) => c.type !== 'unchanged');
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: hasChanges ? 'modified' : 'unchanged',
      children: hasChanges ? arrayChanges : undefined,
    };
  }

  // Both are objects
  if (isObject(oldValue) && isObject(newValue)) {
    const objectChanges = computeObjectDiff(oldValue, newValue, currentPath);
    const hasChanges = objectChanges.some((c) => c.type !== 'unchanged');
    return {
      field,
      path: currentPath,
      oldValue,
      newValue,
      type: hasChanges ? 'modified' : 'unchanged',
      children: hasChanges ? objectChanges : undefined,
    };
  }

  // Primitives
  const isEqual = oldValue === newValue;
  return {
    field,
    path: currentPath,
    oldValue,
    newValue,
    type: isEqual ? 'unchanged' : 'modified',
  };
}

/**
 * Compute differences between two objects
 * Automatically filters out internal/system fields
 */
export function computeObjectDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  basePath: string[] = []
): DiffChange[] {
  // Filter internal fields from both objects before computing diff
  const filteredOldObj = filterInternalFields(oldObj);
  const filteredNewObj = filterInternalFields(newObj);

  const allKeys = new Set([...Object.keys(filteredOldObj), ...Object.keys(filteredNewObj)]);
  const changes: DiffChange[] = [];

  for (const key of allKeys) {
    const oldVal = filteredOldObj[key];
    const newVal = filteredNewObj[key];
    const change = computeDiff(oldVal, newVal, key, basePath);
    changes.push(change);
  }

  // Sort: removed first, then modified, then added, then unchanged
  const typeOrder: Record<DiffChangeType, number> = {
    removed: 0,
    modified: 1,
    added: 2,
    unchanged: 3,
  };

  return changes.sort((a, b) => {
    const orderDiff = typeOrder[a.type] - typeOrder[b.type];
    if (orderDiff !== 0) return orderDiff;
    return a.field.localeCompare(b.field);
  });
}

/**
 * Compute differences between two arrays
 */
export function computeArrayDiff(
  oldArr: unknown[],
  newArr: unknown[],
  _field: string,
  basePath: string[]
): DiffChange[] {
  const changes: DiffChange[] = [];
  const maxLength = Math.max(oldArr.length, newArr.length);

  for (let i = 0; i < maxLength; i++) {
    const oldVal = i < oldArr.length ? oldArr[i] : undefined;
    const newVal = i < newArr.length ? newArr[i] : undefined;
    const change = computeDiff(oldVal, newVal, `[${i}]`, basePath);
    changes.push(change);
  }

  return changes;
}

// ============================================================================
// Diff Summary
// ============================================================================

/**
 * Calculate summary statistics for a diff
 */
export function computeDiffSummary(changes: DiffChange[]): DiffSummary {
  const summary: DiffSummary = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
  };

  function countChanges(changeList: DiffChange[]) {
    for (const change of changeList) {
      summary[change.type]++;
      if (change.children) {
        countChanges(change.children);
      }
    }
  }

  countChanges(changes);
  return summary;
}

/**
 * Get only the changes (exclude unchanged)
 */
export function getSignificantChanges(changes: DiffChange[]): DiffChange[] {
  return changes.filter((change) => change.type !== 'unchanged');
}

/**
 * Flatten nested changes into a flat list
 */
export function flattenChanges(changes: DiffChange[]): DiffChange[] {
  const result: DiffChange[] = [];

  function flatten(changeList: DiffChange[]) {
    for (const change of changeList) {
      result.push(change);
      if (change.children) {
        flatten(change.children);
      }
    }
  }

  flatten(changes);
  return result;
}

// ============================================================================
// Version Diff
// ============================================================================

/**
 * Compute full diff between two version entries
 */
export function computeVersionDiff(
  fromVersion: VersionEntry,
  toVersion: VersionEntry
): VersionDiff {
  const oldValue = fromVersion.details.newValue || fromVersion.details.oldValue || {};
  const newValue = toVersion.details.newValue || {};

  const changes = computeObjectDiff(
    oldValue as Record<string, unknown>,
    newValue as Record<string, unknown>
  );

  const summary = computeDiffSummary(changes);

  return {
    fromVersion,
    toVersion,
    changes,
    summary,
  };
}

// ============================================================================
// String Diff (for text/code)
// ============================================================================

export interface LineDiff {
  lineNumber: number;
  content: string;
  type: DiffChangeType;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Compute line-by-line diff for strings
 */
export function computeLineDiff(oldText: string, newText: string): LineDiff[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: LineDiff[] = [];

  // Simple LCS-based diff algorithm
  const lcs = computeLCS(oldLines, newLines);
  let oldIdx = 0;
  let newIdx = 0;
  let lineNum = 1;

  for (const match of lcs) {
    // Add removed lines
    while (oldIdx < match.oldIndex) {
      result.push({
        lineNumber: lineNum++,
        content: oldLines[oldIdx],
        type: 'removed',
        oldLineNumber: oldIdx + 1,
      });
      oldIdx++;
    }

    // Add added lines
    while (newIdx < match.newIndex) {
      result.push({
        lineNumber: lineNum++,
        content: newLines[newIdx],
        type: 'added',
        newLineNumber: newIdx + 1,
      });
      newIdx++;
    }

    // Add unchanged line
    result.push({
      lineNumber: lineNum++,
      content: newLines[newIdx],
      type: 'unchanged',
      oldLineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
    });
    oldIdx++;
    newIdx++;
  }

  // Remaining removed lines
  while (oldIdx < oldLines.length) {
    result.push({
      lineNumber: lineNum++,
      content: oldLines[oldIdx],
      type: 'removed',
      oldLineNumber: oldIdx + 1,
    });
    oldIdx++;
  }

  // Remaining added lines
  while (newIdx < newLines.length) {
    result.push({
      lineNumber: lineNum++,
      content: newLines[newIdx],
      type: 'added',
      newLineNumber: newIdx + 1,
    });
    newIdx++;
  }

  return result;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

/**
 * Compute Longest Common Subsequence for line diff
 */
function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a value for display in diff
 */
export function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (isArray(value)) return JSON.stringify(value, null, 2);
  if (isObject(value)) return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * Get a human-readable path string
 */
export function formatPath(path: string[]): string {
  return path
    .filter((p) => p !== 'root')
    .map((p) => (p.startsWith('[') ? p : `.${p}`))
    .join('')
    .replace(/^\./, '');
}

/**
 * Get changed field names from a diff
 */
export function getChangedFields(changes: DiffChange[]): string[] {
  const fields: string[] = [];

  function collectFields(changeList: DiffChange[], prefix: string = '') {
    for (const change of changeList) {
      if (change.type !== 'unchanged') {
        const fieldPath = prefix ? `${prefix}.${change.field}` : change.field;
        fields.push(fieldPath);
      }
      if (change.children) {
        const newPrefix = prefix ? `${prefix}.${change.field}` : change.field;
        collectFields(change.children, newPrefix);
      }
    }
  }

  collectFields(changes);
  return fields;
}

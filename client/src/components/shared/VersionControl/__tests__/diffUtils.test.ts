/**
 * Unit tests for diff utilities
 */

import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  computeDiff,
  computeObjectDiff,
  computeDiffSummary,
  getSignificantChanges,
  flattenChanges,
  computeLineDiff,
  formatValue,
  formatPath,
  getChangedFields,
} from '../utils/diffUtils';

describe('diffUtils', () => {
  describe('deepEqual', () => {
    it('should return true for identical primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('hello', 'hello')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
    });

    it('should return false for different primitives', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('hello', 'world')).toBe(false);
      expect(deepEqual(true, false)).toBe(false);
    });

    it('should return true for identical arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    });

    it('should return false for different arrays', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('should return true for identical objects', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ nested: { value: 1 } }, { nested: { value: 1 } })).toBe(true);
    });

    it('should return false for different objects', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
    });
  });

  describe('computeDiff', () => {
    it('should detect added values', () => {
      const result = computeDiff(null, 'new value', 'field');
      expect(result.type).toBe('added');
      expect(result.newValue).toBe('new value');
    });

    it('should detect removed values', () => {
      const result = computeDiff('old value', null, 'field');
      expect(result.type).toBe('removed');
      expect(result.oldValue).toBe('old value');
    });

    it('should detect modified values', () => {
      const result = computeDiff('old', 'new', 'field');
      expect(result.type).toBe('modified');
      expect(result.oldValue).toBe('old');
      expect(result.newValue).toBe('new');
    });

    it('should detect unchanged values', () => {
      const result = computeDiff('same', 'same', 'field');
      expect(result.type).toBe('unchanged');
    });
  });

  describe('computeObjectDiff', () => {
    it('should detect added fields', () => {
      const result = computeObjectDiff({}, { newField: 'value' });
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('newField');
      expect(result[0].type).toBe('added');
    });

    it('should detect removed fields', () => {
      const result = computeObjectDiff({ oldField: 'value' }, {});
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('oldField');
      expect(result[0].type).toBe('removed');
    });

    it('should detect modified fields', () => {
      const result = computeObjectDiff({ field: 'old' }, { field: 'new' });
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('field');
      expect(result[0].type).toBe('modified');
    });

    it('should handle nested objects', () => {
      const oldObj = { nested: { value: 1 } };
      const newObj = { nested: { value: 2 } };
      const result = computeObjectDiff(oldObj, newObj);

      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('nested');
      expect(result[0].type).toBe('modified');
      expect(result[0].children).toBeDefined();
    });
  });

  describe('computeDiffSummary', () => {
    it('should count changes correctly', () => {
      const changes = [
        { field: 'a', path: ['a'], oldValue: null, newValue: 1, type: 'added' as const },
        { field: 'b', path: ['b'], oldValue: 2, newValue: null, type: 'removed' as const },
        { field: 'c', path: ['c'], oldValue: 3, newValue: 4, type: 'modified' as const },
        { field: 'd', path: ['d'], oldValue: 5, newValue: 5, type: 'unchanged' as const },
      ];

      const summary = computeDiffSummary(changes);
      expect(summary.added).toBe(1);
      expect(summary.removed).toBe(1);
      expect(summary.modified).toBe(1);
      expect(summary.unchanged).toBe(1);
    });
  });

  describe('getSignificantChanges', () => {
    it('should filter out unchanged items', () => {
      const changes = [
        { field: 'a', path: ['a'], oldValue: null, newValue: 1, type: 'added' as const },
        { field: 'b', path: ['b'], oldValue: 1, newValue: 1, type: 'unchanged' as const },
      ];

      const significant = getSignificantChanges(changes);
      expect(significant).toHaveLength(1);
      expect(significant[0].field).toBe('a');
    });
  });

  describe('flattenChanges', () => {
    it('should flatten nested changes', () => {
      const changes = [
        {
          field: 'parent',
          path: ['parent'],
          oldValue: {},
          newValue: {},
          type: 'modified' as const,
          children: [
            { field: 'child', path: ['parent', 'child'], oldValue: 1, newValue: 2, type: 'modified' as const },
          ],
        },
      ];

      const flattened = flattenChanges(changes);
      expect(flattened).toHaveLength(2);
    });
  });

  describe('computeLineDiff', () => {
    it('should detect added lines', () => {
      const oldText = 'line1\nline2';
      const newText = 'line1\nline2\nline3';
      const result = computeLineDiff(oldText, newText);

      const added = result.filter((l) => l.type === 'added');
      expect(added).toHaveLength(1);
      expect(added[0].content).toBe('line3');
    });

    it('should detect removed lines', () => {
      const oldText = 'line1\nline2\nline3';
      const newText = 'line1\nline2';
      const result = computeLineDiff(oldText, newText);

      const removed = result.filter((l) => l.type === 'removed');
      expect(removed).toHaveLength(1);
      expect(removed[0].content).toBe('line3');
    });

    it('should handle unchanged text', () => {
      const text = 'line1\nline2';
      const result = computeLineDiff(text, text);

      expect(result.every((l) => l.type === 'unchanged')).toBe(true);
    });
  });

  describe('formatValue', () => {
    it('should format null', () => {
      expect(formatValue(null)).toBe('null');
    });

    it('should format undefined', () => {
      expect(formatValue(undefined)).toBe('undefined');
    });

    it('should format strings with quotes', () => {
      expect(formatValue('hello')).toBe('"hello"');
    });

    it('should format booleans', () => {
      expect(formatValue(true)).toBe('true');
      expect(formatValue(false)).toBe('false');
    });

    it('should format numbers', () => {
      expect(formatValue(42)).toBe('42');
    });
  });

  describe('formatPath', () => {
    it('should format simple paths', () => {
      expect(formatPath(['root', 'field'])).toBe('field');
    });

    it('should format nested paths', () => {
      expect(formatPath(['root', 'parent', 'child'])).toBe('parent.child');
    });

    it('should handle array indices', () => {
      expect(formatPath(['root', 'items', '[0]'])).toBe('items[0]');
    });
  });

  describe('getChangedFields', () => {
    it('should return changed field names', () => {
      const changes = [
        { field: 'a', path: ['a'], oldValue: 1, newValue: 2, type: 'modified' as const },
        { field: 'b', path: ['b'], oldValue: 3, newValue: 3, type: 'unchanged' as const },
        { field: 'c', path: ['c'], oldValue: null, newValue: 4, type: 'added' as const },
      ];

      const fields = getChangedFields(changes);
      expect(fields).toContain('a');
      expect(fields).toContain('c');
      expect(fields).not.toContain('b');
    });
  });
});

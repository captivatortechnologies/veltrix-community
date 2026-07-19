/**
 * Unit tests for format utilities
 */

import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatRelativeTime,
  getUserInitials,
  getUserDisplayName,
  getUserAvatarColor,
  getActionLabel,
  getDeployStateLabel,
  getActionColorClasses,
  getDeployStateColorClasses,
  generateCommitMessage,
  formatEntityType,
  entriesToCSV,
} from '../utils/formatUtils';
import type { VersionEntry, ConfigActionType, DeployState } from '../types';

describe('formatUtils', () => {
  describe('formatTimestamp', () => {
    it('should format a date string', () => {
      const result = formatTimestamp('2024-01-15T10:30:00Z');
      expect(result).toContain('2024');
      expect(result).toContain('Jan');
    });

    it('should format a Date object', () => {
      const date = new Date('2024-06-20T14:45:00Z');
      const result = formatTimestamp(date);
      expect(result).toContain('2024');
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "just now" for recent timestamps', () => {
      const now = new Date();
      const result = formatRelativeTime(now);
      expect(result).toBe('just now');
    });

    it('should return minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo);
      expect(result).toContain('minute');
    });

    it('should return hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const result = formatRelativeTime(threeHoursAgo);
      expect(result).toContain('hour');
    });

    it('should return days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoDaysAgo);
      expect(result).toContain('day');
    });
  });

  describe('getUserInitials', () => {
    it('should return initials from full name', () => {
      const user = { id: '1', email: 'john@test.com', name: 'John Doe' };
      expect(getUserInitials(user)).toBe('JD');
    });

    it('should handle single name', () => {
      const user = { id: '1', email: 'john@test.com', name: 'John' };
      expect(getUserInitials(user)).toBe('J');
    });

    it('should use email if no name', () => {
      const user = { id: '1', email: 'john@test.com', name: '' };
      expect(getUserInitials(user)).toBe('J');
    });
  });

  describe('getUserDisplayName', () => {
    it('should return name if available', () => {
      const user = { id: '1', email: 'john@test.com', name: 'John Doe' };
      expect(getUserDisplayName(user)).toBe('John Doe');
    });

    it('should return email username if no name', () => {
      const user = { id: '1', email: 'john@test.com', name: '' };
      expect(getUserDisplayName(user)).toBe('john');
    });
  });

  describe('getUserAvatarColor', () => {
    it('should return a consistent color for same email', () => {
      const color1 = getUserAvatarColor('test@example.com');
      const color2 = getUserAvatarColor('test@example.com');
      expect(color1).toBe(color2);
    });

    it('should return a bg-* class', () => {
      const color = getUserAvatarColor('user@example.com');
      expect(color).toMatch(/^bg-\w+-500$/);
    });
  });

  describe('getActionLabel', () => {
    it('should return correct labels for each action', () => {
      expect(getActionLabel('CREATED')).toBe('Created');
      expect(getActionLabel('UPDATED')).toBe('Updated');
      expect(getActionLabel('DELETED')).toBe('Deleted');
      expect(getActionLabel('APPROVED')).toBe('Approved');
      expect(getActionLabel('REJECTED')).toBe('Rejected');
      expect(getActionLabel('DEPLOYED')).toBe('Deployed');
      expect(getActionLabel('REVERTED')).toBe('Reverted');
    });
  });

  describe('getDeployStateLabel', () => {
    it('should return correct labels for each state', () => {
      expect(getDeployStateLabel('pending_approval')).toBe('Pending Approval');
      expect(getDeployStateLabel('approved')).toBe('Approved');
      expect(getDeployStateLabel('rejected')).toBe('Rejected');
      expect(getDeployStateLabel('deployed')).toBe('Deployed');
      expect(getDeployStateLabel('draft')).toBe('Draft');
    });
  });

  describe('getActionColorClasses', () => {
    it('should return color classes for each action', () => {
      const actions: ConfigActionType[] = [
        'CREATED',
        'UPDATED',
        'DELETED',
        'APPROVED',
        'REJECTED',
        'DEPLOYED',
        'REVERTED',
      ];

      actions.forEach((action) => {
        const classes = getActionColorClasses(action);
        expect(classes).toContain('bg-');
        expect(classes).toContain('text-');
        expect(classes).toContain('dark:');
      });
    });
  });

  describe('getDeployStateColorClasses', () => {
    it('should return color classes for each state', () => {
      const states: DeployState[] = [
        'pending_approval',
        'approved',
        'rejected',
        'deployed',
        'draft',
      ];

      states.forEach((state) => {
        const classes = getDeployStateColorClasses(state);
        expect(classes).toContain('bg-');
        expect(classes).toContain('text-');
        expect(classes).toContain('dark:');
      });
    });
  });

  describe('generateCommitMessage', () => {
    const mockEntry: VersionEntry = {
      id: '123',
      timestamp: '2024-01-15T10:30:00Z',
      action: 'CREATED',
      entityType: 'INDEX',
      entityId: 'idx-1',
      entityName: 'main_index',
      details: {},
      user: { id: '1', email: 'user@test.com', name: 'Test User' },
      customerId: 'cust-1',
    };

    it('should generate message for CREATED action', () => {
      const message = generateCommitMessage(mockEntry);
      expect(message).toContain('Created');
      expect(message).toContain('main_index');
    });

    it('should generate message for UPDATED action with changed fields', () => {
      const entry = {
        ...mockEntry,
        action: 'UPDATED' as ConfigActionType,
        details: { changedFields: ['field1', 'field2'] },
      };
      const message = generateCommitMessage(entry);
      expect(message).toContain('Updated');
      expect(message).toContain('field1');
    });

    it('should use custom message if provided', () => {
      const entry = {
        ...mockEntry,
        details: { message: 'Custom commit message' },
      };
      const message = generateCommitMessage(entry);
      expect(message).toBe('Custom commit message');
    });
  });

  describe('formatEntityType', () => {
    it('should format single word entity types', () => {
      expect(formatEntityType('INDEX')).toBe('Index');
    });

    it('should format multi-word entity types', () => {
      expect(formatEntityType('DEFAULT_INDEX')).toBe('Default Index');
    });

    it('should handle lowercase input', () => {
      expect(formatEntityType('role')).toBe('Role');
    });
  });

  describe('entriesToCSV', () => {
    const mockEntries: VersionEntry[] = [
      {
        id: '123',
        timestamp: '2024-01-15T10:30:00Z',
        action: 'CREATED',
        entityType: 'INDEX',
        entityId: 'idx-1',
        entityName: 'main_index',
        details: {},
        user: { id: '1', email: 'user@test.com', name: 'Test User' },
        customerId: 'cust-1',
      },
    ];

    it('should generate CSV with headers', () => {
      const csv = entriesToCSV(mockEntries);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('Timestamp');
      expect(lines[0]).toContain('Action');
      expect(lines[0]).toContain('Entity Type');
    });

    it('should include entry data', () => {
      const csv = entriesToCSV(mockEntries);
      expect(csv).toContain('Created');
      expect(csv).toContain('Index');
      expect(csv).toContain('Test User');
    });

    it('should escape commas in values', () => {
      const entries = [
        {
          ...mockEntries[0],
          entityName: 'name, with comma',
        },
      ];
      const csv = entriesToCSV(entries);
      expect(csv).toContain('"name, with comma"');
    });
  });
});

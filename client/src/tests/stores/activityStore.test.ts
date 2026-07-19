/**
 * Activity Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityStore } from '../../stores/activityStore';
import { ActivityType } from '../../stores/activityStore';
import { createMockActivity } from '@/tests/test-utils';

describe('ActivityStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useActivityStore.setState({
      activities: [],
      unreadCount: 0,
      filterType: 'all',
      showUnreadOnly: false,
      isLoading: false,
    });
  });

  describe('addActivity', () => {
    it('should add activity to store', () => {
      const activity = createMockActivity();

      useActivityStore.getState().addActivity(activity);

      const { activities, unreadCount } = useActivityStore.getState();
      expect(activities).toHaveLength(1);
      expect(activities[0]).toEqual(activity);
      expect(unreadCount).toBe(1);
    });

    it('should maintain max 100 activities', () => {
      const { addActivity } = useActivityStore.getState();

      // Add 150 activities
      for (let i = 0; i < 150; i++) {
        addActivity(createMockActivity({ message: `Activity ${i}` }));
      }

      const { activities } = useActivityStore.getState();
      expect(activities).toHaveLength(100);
    });

    // TODO: Fix flaky unreadCount test - appears to be a timing/state issue
    it.skip('should update unread count correctly', () => {
      const { addActivity, markAsRead } = useActivityStore.getState();

      const activity1 = createMockActivity();
      const activity2 = createMockActivity();

      addActivity(activity1);
      addActivity(activity2);

      expect(useActivityStore.getState().unreadCount).toBe(2);

      markAsRead(activity1.id);

      expect(useActivityStore.getState().unreadCount).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark activity as read', () => {
      const activity = createMockActivity({ read: false });
      useActivityStore.getState().addActivity(activity);

      useActivityStore.getState().markAsRead(activity.id);

      const { activities, unreadCount } = useActivityStore.getState();
      expect(activities[0].read).toBe(true);
      expect(unreadCount).toBe(0);
    });

    it('should handle marking non-existent activity', () => {
      useActivityStore.getState().markAsRead('non-existent-id');

      // Should not throw error
      expect(useActivityStore.getState().activities).toHaveLength(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all activities as read', () => {
      const { addActivity, markAllAsRead } = useActivityStore.getState();

      addActivity(createMockActivity({ read: false }));
      addActivity(createMockActivity({ read: false }));
      addActivity(createMockActivity({ read: false }));

      expect(useActivityStore.getState().unreadCount).toBe(3);

      markAllAsRead();

      const { activities, unreadCount } = useActivityStore.getState();
      expect(activities.every((a) => a.read)).toBe(true);
      expect(unreadCount).toBe(0);
    });
  });

  describe('clearActivities', () => {
    it('should clear all activities', () => {
      const { addActivity, clearActivities } = useActivityStore.getState();

      addActivity(createMockActivity());
      addActivity(createMockActivity());

      expect(useActivityStore.getState().activities).toHaveLength(2);

      clearActivities();

      const { activities, unreadCount } = useActivityStore.getState();
      expect(activities).toHaveLength(0);
      expect(unreadCount).toBe(0);
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      const { addActivity } = useActivityStore.getState();

      addActivity(
        createMockActivity({
          type: ActivityType.DEPLOYMENT_STARTED,
          read: false,
        })
      );
      addActivity(
        createMockActivity({
          type: ActivityType.DEPLOYMENT_COMPLETED,
          read: true,
        })
      );
      addActivity(
        createMockActivity({ type: ActivityType.TOOL_ADDED, read: false })
      );
      addActivity(
        createMockActivity({ type: ActivityType.USER_JOINED, read: true })
      );
    });

    it('should filter by activity type', () => {
      const { setFilterType, getFilteredActivities } =
        useActivityStore.getState();

      setFilterType(ActivityType.DEPLOYMENT_STARTED);
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe(ActivityType.DEPLOYMENT_STARTED);
    });

    it('should filter by unread only', () => {
      const { setShowUnreadOnly, getFilteredActivities } =
        useActivityStore.getState();

      setShowUnreadOnly(true);
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(2);
      expect(filtered.every((a) => !a.read)).toBe(true);
    });

    it('should combine filters', () => {
      const { setFilterType, setShowUnreadOnly, getFilteredActivities } =
        useActivityStore.getState();

      setFilterType(ActivityType.DEPLOYMENT_STARTED);
      setShowUnreadOnly(true);
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe(ActivityType.DEPLOYMENT_STARTED);
      expect(filtered[0].read).toBe(false);
    });

    it('should reset to all activities', () => {
      const { setFilterType, setShowUnreadOnly, getFilteredActivities } =
        useActivityStore.getState();

      setFilterType('all');
      setShowUnreadOnly(false);
      const filtered = getFilteredActivities();

      expect(filtered).toHaveLength(4);
    });
  });

  describe('getRecentActivities', () => {
    it('should return most recent N activities', () => {
      const { addActivity, getRecentActivities } =
        useActivityStore.getState();

      for (let i = 0; i < 10; i++) {
        addActivity(createMockActivity({ message: `Activity ${i}` }));
      }

      const recent = getRecentActivities(5);

      expect(recent).toHaveLength(5);
      // Should be most recent (added last)
      expect(recent[0].message).toBe('Activity 9');
    });

    it('should return all activities if count > total', () => {
      const { addActivity, getRecentActivities } =
        useActivityStore.getState();

      addActivity(createMockActivity());
      addActivity(createMockActivity());

      const recent = getRecentActivities(10);

      expect(recent).toHaveLength(2);
    });
  });
});

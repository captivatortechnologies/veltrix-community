/**
 * Version Control API
 * Client-side API functions for version control endpoints
 */

import api from '@/services/api';
import type {
  VersionEntry,
  VersionFilters,
  PaginationParams,
  PaginatedResponse,
} from '../types';

const BASE_URL = '/configuration-history';

export const versionControlApi = {
  /**
   * Get version history with optional filters and pagination
   */
  async getHistory(
    filters?: VersionFilters,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<VersionEntry>> {
    const params = new URLSearchParams();

    if (filters?.action?.length) {
      params.append('action', filters.action.join(','));
    }
    if (filters?.entityType?.length) {
      params.append('entityType', filters.entityType.join(','));
    }
    if (filters?.entityId) {
      params.append('entityId', filters.entityId);
    }
    if (filters?.userId) {
      params.append('userId', filters.userId);
    }
    if (filters?.deployState?.length) {
      params.append('deployState', filters.deployState.join(','));
    }
    if (filters?.startDate) {
      params.append('startDate', filters.startDate);
    }
    if (filters?.endDate) {
      params.append('endDate', filters.endDate);
    }
    if (filters?.searchTerm) {
      params.append('searchTerm', filters.searchTerm);
    }
    if (pagination?.page) {
      params.append('page', String(pagination.page));
    }
    if (pagination?.limit) {
      params.append('limit', String(pagination.limit));
    }

    const response = await api.get(`${BASE_URL}?${params.toString()}`);
    return response.data;
  },

  /**
   * Get a single history entry by ID
   */
  async getHistoryById(id: string): Promise<VersionEntry> {
    const response = await api.get(`${BASE_URL}/${id}`);
    return response.data;
  },

  /**
   * Get pending approvals
   */
  async getPendingApprovals(
    entityType?: string,
    entityId?: string
  ): Promise<VersionEntry[]> {
    const params = new URLSearchParams();
    if (entityType) params.append('entityType', entityType);
    if (entityId) params.append('entityId', entityId);

    const response = await api.get(`${BASE_URL}/pending-approvals?${params.toString()}`);
    return response.data;
  },

  /**
   * Approve a pending change
   */
  async approve(id: string): Promise<VersionEntry> {
    const response = await api.post(`${BASE_URL}/approve/${id}`);
    return response.data;
  },

  /**
   * Reject a pending change
   */
  async reject(id: string, reason?: string): Promise<VersionEntry> {
    const response = await api.post(`${BASE_URL}/reject/${id}`, { reason });
    return response.data;
  },

  /**
   * Revert to a previous version
   */
  async revert(versionId: string): Promise<{ success: boolean; newVersionId: string }> {
    const response = await api.post(`${BASE_URL}/revert`, { versionId });
    return response.data;
  },

  /**
   * Get available entity types for filter dropdown
   */
  async getEntityTypes(): Promise<string[]> {
    const response = await api.get(`${BASE_URL}/entity-types`);
    return response.data;
  },

  /**
   * Get available users for filter dropdown
   */
  async getUsers(): Promise<Array<{ id: string; email: string; name: string }>> {
    const response = await api.get(`${BASE_URL}/users`);
    return response.data;
  },
};

/**
 * Configuration Canvas API Service
 *
 * Provides CRUD operations for configuration canvases
 */

import { API_URL } from '@/config';
import { ConfigSection } from '../types';

// Helper function to get cookie value by name
const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift();
    return cookieValue || null;
  }
  return null;
};

// Helper function to get authentication headers
const getAuthHeaders = (includeContentType = true, includeCSRF = false): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Include CSRF token for state-changing requests
  if (includeCSRF) {
    const csrfToken = getCookie('XSRF-TOKEN');
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }
  }
  return headers;
};

// Types
export type ConfigCanvasStatus = 'DRAFT' | 'VALIDATION_PENDING' | 'VALIDATION_FAILED' | 'PENDING_APPROVAL' | 'APPROVED' | 'DEPLOYMENT_QUEUED' | 'DEPLOYING' | 'DEPLOYMENT_PAUSED' | 'DEPLOYED' | 'DEPLOYMENT_FAILED' | 'ROLLED_BACK' | 'ARCHIVED' | 'CHANGES_REQUESTED';

export interface ConfigurationCanvasSection {
  id?: string;
  name: string;
  icon?: string;
  description?: string;
  collapsed?: boolean;
  order: number;
  fields: ConfigurationCanvasField[];
}

export interface ConfigurationCanvasField {
  id?: string;
  key: string;
  label: string;
  fieldType: string;
  value?: unknown;
  defaultValue?: unknown;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: unknown;
  validation?: unknown;
  /** Presentational group this field renders under inside its item. */
  group?: string;
  order: number;
  disabled?: boolean;
}

export interface ConfigurationCanvasTag {
  id: string;
  canvasId: string;
  tagId: string;
  tag: {
    id: string;
    name: string;
  };
}

export interface ConfigurationCanvas {
  id: string;
  name: string;
  description?: string;
  toolType: string;
  entityType: string;
  status: ConfigCanvasStatus;
  version: number;
  customerId: string;
  createdById: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
  sections: ConfigurationCanvasSection[];
  tags?: ConfigurationCanvasTag[];
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  updatedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ConfigurationCanvasListItem {
  id: string;
  name: string;
  description?: string;
  toolType: string;
  entityType: string;
  status: ConfigCanvasStatus;
  version: number;
  sectionsCount: number;
  createdAt: string;
  updatedAt: string;
  tags?: ConfigurationCanvasTag[];
  createdBy?: {
    id: string;
    name: string;
  };
}

export interface CreateConfigurationCanvasRequest {
  name: string;
  description?: string;
  toolType: string;
  entityType: string;
  sections?: ConfigurationCanvasSection[];
  tagIds?: string[]; // Environment/Tag IDs
}

export interface UpdateConfigurationCanvasRequest {
  name?: string;
  description?: string;
  status?: ConfigCanvasStatus;
  sections?: ConfigurationCanvasSection[];
  tagIds?: string[]; // Environment/Tag IDs
  comment?: string;
}

export interface ConfigurationCanvasHistoryEntry {
  id: string;
  canvasId: string;
  version: number;
  action: string;
  snapshot: unknown;
  comment?: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface VersionComparisonResult {
  version1: {
    id: string;
    version: number;
    action: string;
    createdAt: string;
    user?: { id: string; name: string; email: string };
  };
  version2: {
    id: string;
    version: number;
    action: string;
    createdAt: string;
    user?: { id: string; name: string; email: string };
  };
  diff: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
    changes: Array<{
      type: 'added' | 'removed' | 'modified';
      path: string;
      oldValue?: unknown;
      newValue?: unknown;
    }>;
  };
}

export interface ApprovalEntry {
  id: string;
  approver: {
    id: string;
    name: string;
    email: string;
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  comment?: string;
  submissionComment?: string;
  respondedAt?: string;
  createdAt: string;
  environments: Array<{
    id: string;
    name: string;
  }>;
}

export interface ApprovalStatus {
  canvasId: string;
  canvasStatus: ConfigCanvasStatus;
  approvals: ApprovalEntry[];
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
}

export interface ReviewComment {
  id: string;
  canvasId: string;
  historyId?: string | null;
  parentId?: string | null;
  userId: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  replies?: ReviewComment[];
}

// API endpoint
const ENDPOINT = `${API_URL}/configuration-canvas`;

// Convert client ConfigSection to API format
const toApiSection = (section: ConfigSection): ConfigurationCanvasSection => ({
  name: section.name,
  icon: section.icon,
  description: section.description,
  collapsed: section.collapsed,
  order: section.order,
  fields: section.fields.map((field) => ({
    key: field.key,
    label: field.label,
    fieldType: field.type,
    value: field.value,
    defaultValue: field.defaultValue,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options,
    validation: field.validation,
    group: field.group,
    order: field.order,
    disabled: field.disabled,
  })),
});

// Convert API section to client ConfigSection format
const fromApiSection = (section: ConfigurationCanvasSection): ConfigSection => ({
  id: section.id || `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: section.name,
  icon: section.icon,
  description: section.description,
  collapsed: section.collapsed ?? false,
  order: section.order,
  fields: section.fields.map((field) => ({
    id: field.id || `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    key: field.key,
    label: field.label,
    type: field.fieldType as ConfigSection['fields'][0]['type'],
    value: field.value,
    defaultValue: field.defaultValue,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options as ConfigSection['fields'][0]['options'],
    validation: field.validation as ConfigSection['fields'][0]['validation'],
    group: field.group,
    order: field.order,
    disabled: field.disabled,
  })),
});

// API response types
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Configuration Canvas API
 */
export const configurationCanvasApi = {
  /**
   * Get all configuration canvases
   */
  getAll: async (params?: {
    toolType?: string;
    entityType?: string;
    status?: ConfigCanvasStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ConfigurationCanvasListItem[]> => {
    const queryParams = new URLSearchParams();
    if (params?.toolType) queryParams.append('toolType', params.toolType);
    if (params?.entityType) queryParams.append('entityType', params.entityType);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const url = queryParams.toString() ? `${ENDPOINT}?${queryParams}` : ENDPOINT;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      throw new Error(`Failed to fetch configurations: ${response.statusText}`);
    }

    const result: PaginatedResponse<ConfigurationCanvasListItem> = await response.json();
    return result.data;
  },

  /**
   * Get a configuration canvas by ID
   */
  getById: async (id: string): Promise<ConfigurationCanvas> => {
    const response = await fetch(`${ENDPOINT}/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to fetch configuration: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Create a new configuration canvas
   */
  create: async (
    data: CreateConfigurationCanvasRequest,
    sections?: ConfigSection[]
  ): Promise<ConfigurationCanvas> => {
    const payload = {
      ...data,
      sections: sections?.map(toApiSection) || [],
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to create configuration: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Update a configuration canvas
   */
  update: async (
    id: string,
    data: UpdateConfigurationCanvasRequest,
    sections?: ConfigSection[]
  ): Promise<ConfigurationCanvas> => {
    const payload = {
      ...data,
      sections: sections ? sections.map(toApiSection) : undefined,
    };

    const response = await fetch(`${ENDPOINT}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to update configuration: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Delete a configuration canvas
   */
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${ENDPOINT}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false, true),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to delete configuration: ${response.statusText}`);
    }
  },

  /**
   * Duplicate a configuration canvas
   */
  duplicate: async (id: string, newName: string): Promise<ConfigurationCanvas> => {
    const response = await fetch(`${ENDPOINT}/${id}/duplicate`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ name: newName }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to duplicate configuration: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get version history for a configuration canvas
   */
  getHistory: async (id: string): Promise<ConfigurationCanvasHistoryEntry[]> => {
    const response = await fetch(`${ENDPOINT}/${id}/history`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to fetch history: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get a specific version
   */
  getVersion: async (id: string, historyId: string): Promise<ConfigurationCanvasHistoryEntry> => {
    const response = await fetch(`${ENDPOINT}/${id}/versions/${historyId}`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Version not found.');
      }
      throw new Error(`Failed to fetch version: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Restore to a previous version
   */
  restoreVersion: async (id: string, historyId: string): Promise<ConfigurationCanvas> => {
    const response = await fetch(`${ENDPOINT}/${id}/versions/${historyId}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(false, true),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Version not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Cannot restore version.');
      }
      throw new Error(`Failed to restore version: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Compare two versions
   */
  compareVersions: async (
    id: string,
    historyId1: string,
    historyId2: string
  ): Promise<VersionComparisonResult> => {
    const response = await fetch(
      `${ENDPOINT}/${id}/compare?historyId1=${historyId1}&historyId2=${historyId2}`,
      {
        method: 'GET',
        headers: getAuthHeaders(false),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Version not found.');
      }
      throw new Error(`Failed to compare versions: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Add a label to a version
   */
  labelVersion: async (
    id: string,
    historyId: string,
    label: string
  ): Promise<ConfigurationCanvasHistoryEntry> => {
    const response = await fetch(`${ENDPOINT}/${id}/versions/${historyId}/label`, {
      method: 'PATCH',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ label }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Version not found.');
      }
      throw new Error(`Failed to label version: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Export configuration as JSON
   */
  exportJson: async (id: string): Promise<unknown> => {
    const response = await fetch(`${ENDPOINT}/${id}/export`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to export configuration: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Update the status of a configuration canvas (for approval workflow)
   */
  updateStatus: async (
    id: string,
    status: ConfigCanvasStatus,
    comment?: string
  ): Promise<ConfigurationCanvas> => {
    const response = await fetch(`${ENDPOINT}/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ status, comment }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Invalid status transition.');
      }
      throw new Error(`Failed to update status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Submit a configuration canvas for approval with designated approvers
   */
  submitForApproval: async (
    id: string,
    approverIds: string[],
    environmentTagIds: string[] = [],
    comment?: string
  ): Promise<ConfigurationCanvas> => {
    const response = await fetch(`${ENDPOINT}/${id}/submit-for-approval`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ approverIds, environmentTagIds, comment }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Cannot submit for approval.');
      }
      throw new Error(`Failed to submit for approval: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get approval status for a configuration canvas
   */
  getApprovals: async (id: string): Promise<ApprovalStatus> => {
    const response = await fetch(`${ENDPOINT}/${id}/approvals`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to fetch approvals: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Approve a configuration canvas (current user must be an assigned approver)
   */
  approveCanvas: async (id: string, comment?: string): Promise<ApprovalStatus> => {
    const response = await fetch(`${ENDPOINT}/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ comment }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Cannot approve canvas.');
      }
      throw new Error(`Failed to approve canvas: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Reject a configuration canvas (current user must be an assigned approver)
   */
  rejectCanvas: async (id: string, reason: string): Promise<ApprovalStatus> => {
    const response = await fetch(`${ENDPOINT}/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ reason }),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Cannot reject canvas.');
      }
      throw new Error(`Failed to reject canvas: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get threaded review comments for a configuration canvas
   */
  getComments: async (
    id: string,
    params?: { historyId?: string }
  ): Promise<ReviewComment[]> => {
    const query = params?.historyId ? `?historyId=${encodeURIComponent(params.historyId)}` : '';
    const response = await fetch(`${ENDPOINT}/${id}/comments${query}`, {
      method: 'GET',
      headers: getAuthHeaders(false),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      throw new Error(`Failed to fetch comments: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Add a review comment (optionally anchored to a version and/or a parent for threading)
   */
  addComment: async (
    id: string,
    data: { body: string; historyId?: string; parentId?: string }
  ): Promise<ReviewComment> => {
    const response = await fetch(`${ENDPOINT}/${id}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Configuration not found.');
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Cannot add comment.');
      }
      throw new Error(`Failed to add comment: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Update a review comment's body and/or resolved flag
   */
  updateComment: async (
    id: string,
    commentId: string,
    data: { body?: string; resolved?: boolean }
  ): Promise<ReviewComment> => {
    const response = await fetch(`${ENDPOINT}/${id}/comments/${commentId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 403) {
        throw new Error('You are not allowed to update this comment.');
      }
      if (response.status === 404) {
        throw new Error('Comment not found.');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to update comment: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Delete a review comment
   */
  deleteComment: async (id: string, commentId: string): Promise<void> => {
    const response = await fetch(`${ENDPOINT}/${id}/comments/${commentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false, true),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Please log in again.');
      }
      if (response.status === 403) {
        throw new Error('You are not allowed to delete this comment.');
      }
      if (response.status === 404) {
        throw new Error('Comment not found.');
      }
      throw new Error(`Failed to delete comment: ${response.statusText}`);
    }
  },

  // Utility to convert API response sections to client format
  sectionsFromApi: (sections: ConfigurationCanvasSection[]): ConfigSection[] => {
    return sections.map(fromApiSection);
  },
};

export default configurationCanvasApi;

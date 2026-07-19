import axios from 'axios';
import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ========================================================================
// Role + live resource catalog transport (R4/R5, RBAC/IdP hardening
// 2026-07-10). `getResources`/`getActions` now mirror the server's live
// catalog shape (server/src/module/role/resource-catalog.ts): every
// enforced platform resource PLUS each installed app's declared
// permissions and configuration types, appId-tagged so a role editor can
// distinguish "tool" (platform) from an app's own "indexes" resource.
// Permission rows (on both roles and create/update payloads) now carry
// `appId` (design decision 1: null = platform-scoped, a real App.id =
// app-scoped).
//
// Error messages: unwrap the server's `{ error: string }` body when present
// (e.g. RoleEscalationError's "Cannot grant permission(s) you do not hold
// yourself: ...", or "Role with name 'X' already exists") — an AxiosError's
// own `.message` is just the generic HTTP status line, which would otherwise
// swallow exactly the detail the role editor needs to show the caller.
// ========================================================================

export interface Permission {
  id: string;
  resource: string;
  action: string;
  roleId: string;
  /** null = platform-scoped, a real App.id = app-scoped. */
  appId: string | null;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  customerId: string;
  permissions?: Permission[];
}

/** A permission grant as sent to create/update role payloads. */
export interface PermissionInput {
  resource: string;
  action: string;
  /** Omit/null for a platform-scoped grant; a real App.id for an app-scoped one. */
  appId?: string | null;
}

/** One resource entry in the live catalog: a name, its valid actions, and scope. */
export interface CatalogResource {
  resource: string;
  actions: string[];
  /** null = platform-scoped resource; a real App.id = app-scoped. */
  appId: string | null;
  /** Present for app-scoped entries — the app's display name. */
  appName?: string;
  description?: string;
}

/** Extract the server's `{ error: string }` body message, falling back to a generic label. */
function toServiceError(error: unknown, fallback: string): Error {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.error;
    if (serverMessage) return new Error(serverMessage);
  }
  if (error instanceof Error) return new Error(error.message);
  return new Error(fallback);
}

// Get all roles
export const getRoles = async (): Promise<Role[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/roles`);
    return response.data;
  } catch (error) {
    throw toServiceError(error, 'Failed to fetch roles');
  }
};

// Get role by ID
export const getRoleById = async (roleId: string): Promise<Role> => {
  try {
    const response = await authAxios.get(`${API_URL}/roles/${roleId}`);
    return response.data;
  } catch (error) {
    throw toServiceError(error, `Failed to fetch role with ID ${roleId}`);
  }
};

// Create new role
export const createRole = async (roleData: {
  name: string;
  description?: string;
  permissions?: PermissionInput[];
}): Promise<Role> => {
  try {
    const response = await authAxios.post(`${API_URL}/roles`, roleData);
    return response.data;
  } catch (error) {
    throw toServiceError(error, 'Failed to create role');
  }
};

// Update role
export const updateRole = async (
  roleId: string,
  roleData: {
    name?: string;
    description?: string;
    permissions?: PermissionInput[];
  }
): Promise<Role> => {
  try {
    const response = await authAxios.put(`${API_URL}/roles/${roleId}`, roleData);
    return response.data;
  } catch (error) {
    throw toServiceError(error, `Failed to update role with ID ${roleId}`);
  }
};

// Delete role
export const deleteRole = async (roleId: string): Promise<void> => {
  try {
    await authAxios.delete(`${API_URL}/roles/${roleId}`);
  } catch (error) {
    throw toServiceError(error, `Failed to delete role with ID ${roleId}`);
  }
};

/**
 * The live resource catalog: every enforced platform resource, plus each
 * installed (enabled) app's declared permissions and configuration types.
 */
export const getResources = async (): Promise<CatalogResource[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/resources`);
    return response.data;
  } catch (error) {
    throw toServiceError(error, 'Failed to fetch resources');
  }
};

/**
 * Actions available for one resource. Pass `appId` to look up an app-scoped
 * resource (e.g. a configTypeId) rather than a platform one.
 */
export const getActions = async (resource: string, appId?: string | null): Promise<string[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/resources/${resource}/actions`, {
      params: appId ? { appId } : undefined,
    });
    return response.data;
  } catch (error) {
    throw toServiceError(error, `Failed to fetch actions for resource ${resource}`);
  }
};

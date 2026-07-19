// Shared API types between frontend and backend

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
}

// Tool types
export interface Tool {
  id: string;
  name: string;
  description: string;
  vendor: string;
  logoUrl?: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  customerId: string;
  roleId: string;
  authProvider?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Organization types
// Single-tenant org/workspace root entity (renamed from `Customer` in the
// commercial edition; `apiKey` and multi-tenant billing fields dropped).
// NOTE: FK columns on other entities remain named `customerId` to minimize
// churn against the source schema (see Organization.id).
export interface Organization {
  id: string;
  name: string;
  domain?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Component types
export interface Component {
  id: string;
  type: string[];
  hostname: string;
  port: string;
  toolId: string;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Credential types
export interface Credential {
  id: string;
  name: string;
  username: string;
  password: string;
  apiToken?: string;
  toolId: string;
  customerId: string;
  type?: string;
  certificate?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Tag types
export interface Tag {
  id: string;
  name: string;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

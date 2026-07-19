// Type definitions for route handlers
export interface AuthenticatedRequest {
  customerId?: string;
  userId?: string;
  user?: {
    id: string;
    email: string;
    customerId: string;
    roleId: string;
  };
}

// Organization types and interfaces
//
// Single-tenant OSS note: the underlying Prisma model is `Organization`
// (renamed from the hosted product's `Customer`). This module exposes only
// the tenant-editable org-details editor — the hosted product's MSSP
// white-label branding view and multi-tenant admin CRUD were removed as
// part of the single-tenant extraction (see docs/ARCHITECTURE.md).

// Organization details type for API responses
export interface OrganizationDetailsType {
  name: string;
  /**
   * Unique, human-readable org shortname. Lowercase letters, numbers and
   * hyphens, 2-31 chars. Null when unset.
   */
  shortName?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  logo?: string | null;
}

// Extended Organization type with org-details columns
export interface ExtendedOrganizationType {
  id: string;
  name: string;
  domain: string | null;
  isActive: boolean;
  shortName?: string | null;
  // Organization details
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  logo?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Swagger schemas
export const organizationSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    shortName: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    state: { type: 'string', nullable: true },
    zipCode: { type: 'string', nullable: true },
    country: { type: 'string', nullable: true },
    industry: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    logo: { type: 'string', nullable: true }
  }
};

export const organizationUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    shortName: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    state: { type: 'string', nullable: true },
    zipCode: { type: 'string', nullable: true },
    country: { type: 'string', nullable: true },
    industry: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    logo: { type: 'string', nullable: true }
  }
};

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

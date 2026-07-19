import prisma from '../../db';
import {
  OrganizationDetailsType,
  ExtendedOrganizationType
} from './organization.schema';
import { loggerService } from '../../module/logger/logger.service';

/** An organization-update failure carrying an HTTP status for the controller. */
export class OrganizationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'OrganizationError';
    this.statusCode = statusCode;
  }
}

// Lowercase letters/numbers/hyphens, 2-31 chars, starting and ending alphanumeric.
const SHORTNAME_RE = /^[a-z0-9][a-z0-9-]{0,29}[a-z0-9]$/;

/**
 * Normalize + validate an organization shortname. Returns the normalized
 * value, or null when the input is empty/absent (which CLEARS the
 * shortname). Throws an OrganizationError (400) on an invalid format.
 */
function normalizeShortName(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  if (!SHORTNAME_RE.test(value)) {
    throw new OrganizationError(
      'Shortname must be 2–31 characters using lowercase letters, numbers and hyphens, starting and ending with a letter or number.',
    );
  }
  return value;
}

/** The whitelist of tenant-editable organization fields (prevents mass-assignment). */
const EDITABLE_FIELDS: Array<keyof OrganizationDetailsType> = [
  'name', 'website', 'phone', 'email', 'address', 'city', 'state', 'zipCode',
  'country', 'industry', 'description', 'logo',
];

export const organizationService = {
  // Get organization details
  async getOrganization(customerId: string): Promise<OrganizationDetailsType> {
    loggerService.info(`Fetching organization details for organization ID ${customerId}`);

    const organization = await prisma.organization.findUnique({
      where: { id: customerId }
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    return toOrganizationDetails(organization as unknown as ExtendedOrganizationType);
  },

  // Update organization details
  async updateOrganization(customerId: string, data: OrganizationDetailsType): Promise<OrganizationDetailsType> {
    loggerService.info(`Updating organization details for organization ID ${customerId}`);

    // Only the tenant-editable fields are written (no mass-assignment of any
    // internal/administrative column).
    const updateData: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in data) updateData[field] = (data as any)[field];
    }

    // Shortname: validate the format and enforce uniqueness across orgs.
    if ('shortName' in data) {
      const shortName = normalizeShortName((data as any).shortName);
      if (shortName) {
        const clash = await prisma.organization.findFirst({
          where: { shortName, id: { not: customerId } },
          select: { id: true },
        });
        if (clash) {
          throw new OrganizationError('That shortname is already taken. Please choose another.', 409);
        }
      }
      updateData.shortName = shortName;
    }

    const organization = await prisma.organization.update({
      where: { id: customerId },
      data: updateData as any,
    });

    return toOrganizationDetails(organization as unknown as ExtendedOrganizationType);
  }
};

/** Project an Organization row down to the tenant-facing details shape. */
function toOrganizationDetails(org: ExtendedOrganizationType): OrganizationDetailsType {
  return {
    name: org.name,
    shortName: org.shortName || null,
    website: org.website || null,
    phone: org.phone || null,
    email: org.email || null,
    address: org.address || null,
    city: org.city || null,
    state: org.state || null,
    zipCode: org.zipCode || null,
    country: org.country || null,
    industry: org.industry || null,
    description: org.description || null,
    logo: org.logo || null,
  };
}

// Brand types and interfaces

export interface BrandResponseType {
  name: string;
  tagline: string;
  logoUrl: string | null;
  /** Brand accent (favicon + browser/PWA theme-color). Any CSS color. */
  color: string;
}

// Swagger schema
export const brandSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    tagline: { type: 'string' },
    logoUrl: { type: 'string', nullable: true },
    color: { type: 'string' },
  },
};

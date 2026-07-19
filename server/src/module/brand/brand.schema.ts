// Brand types and interfaces

export interface BrandResponseType {
  name: string;
  tagline: string;
  logoUrl: string | null;
}

// Swagger schema
export const brandSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    tagline: { type: 'string' },
    logoUrl: { type: 'string', nullable: true },
  },
};

import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../config';
import { BrandResponseType } from './brand.schema';

export const brandController = {
  // Public, unauthenticated: returns the white-label branding the client
  // renders before (and after) login. No tenant/user context involved.
  getBrand: async (_request: FastifyRequest, reply: FastifyReply) => {
    const brand: BrandResponseType = {
      name: config.brand.name,
      tagline: config.brand.tagline,
      logoUrl: config.brand.logoUrl,
    };
    reply.send(brand);
  },
};

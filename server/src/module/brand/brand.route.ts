import { FastifyInstance } from 'fastify';
import { brandController } from './brand.controller';
import { brandSchema } from './brand.schema';

/**
 * Public branding endpoint — no auth, no tenant scoping. The client fetches
 * this (pre- and post-login) to render the product name/tagline/logo from
 * VELTRIX_BRAND_NAME / VELTRIX_BRAND_TAGLINE / VELTRIX_BRAND_LOGO_URL,
 * defaulting to "Veltrix" / "Security-as-Code" / no logo. Deliberately has
 * no preHandler — this must stay reachable before a session exists.
 */
export async function brandRoutes(fastify: FastifyInstance) {
  fastify.get('/brand', {
    schema: {
      tags: ['brand'],
      summary: 'Get public branding',
      description: 'Returns the deployment\'s branding (name, tagline, logo URL). Public, no authentication required.',
      response: {
        200: brandSchema,
      },
    },
    handler: brandController.getBrand,
  });
}

export default brandRoutes;

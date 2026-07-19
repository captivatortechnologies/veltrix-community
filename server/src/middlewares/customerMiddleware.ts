import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { loggerService } from '../module/logger/logger.service';

// Middleware to extract the organization (tenant) ID from the request.
//
// Both real call sites (module/report/report.route.ts,
// module/log-entry/log-entry.route.ts) run this AFTER `verifyToken`, which
// already sets `x-customer-id` from the verified JWT — so in practice this
// middleware's job is just to double-check that org is still active. The
// header-absent / API-key branches below exist for any future caller that
// invokes this middleware standalone (without verifyToken first).
export const extractCustomerId = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Try to get organization ID from header
    const customerId = request.headers['x-customer-id'] as string;

    // If no organization ID in header, try to resolve it from an API key
    if (!customerId) {
      const apiKey = request.headers['x-api-key'] as string;

      if (apiKey) {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { key: apiKey },
        });

        if (apiKeyRecord && !apiKeyRecord.revoked) {
          const organization = await prisma.organization.findUnique({
            where: { id: apiKeyRecord.customerId },
          });

          if (organization && organization.isActive) {
            // Add organization ID to request for downstream handlers
            request.headers['x-customer-id'] = organization.id;
            return;
          }
        }
      }

      // If we're here, we couldn't resolve a valid organization.
      // For development, use the default seeded organization.
      if (process.env.NODE_ENV === 'development') {
        request.headers['x-customer-id'] = '00000000-0000-0000-0000-000000000001';
        return;
      }

      // In production, require authentication
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Validate that the organization exists and is active
    const organization = await prisma.organization.findUnique({
      where: { id: customerId },
    });

    if (!organization) {
      return reply.status(404).send({ error: 'Organization not found' });
    }

    if (!organization.isActive) {
      return reply.status(403).send({ error: 'Organization account is inactive' });
    }
  } catch (error) {
    loggerService.error('Error in customer middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

// Middleware to ensure admin access
export const ensureAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // In a real application, check if the user has admin privileges
    // For now, we'll just check for an admin header
    const isAdmin = request.headers['x-admin'] === 'true';

    if (!isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }
  } catch (error) {
    loggerService.error('Error in admin middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

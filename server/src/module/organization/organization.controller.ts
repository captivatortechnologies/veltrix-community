import { FastifyRequest, FastifyReply } from 'fastify';
import { organizationService } from './organization.service';
import { OrganizationDetailsType } from './organization.schema';
import { loggerService } from '../../module/logger/logger.service';

export const organizationController = {
  // Get organization details
  getOrganization: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const customerId = request.user.customerId;

      try {
        const organizationDetails = await organizationService.getOrganization(customerId);
        reply.send(organizationDetails);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Organization not found') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error fetching organization details:', error);
      reply.status(500).send({ error: 'Error fetching organization details' });
    }
  },

  // Update organization details
  updateOrganization: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const customerId = request.user.customerId;
      const data = request.body as OrganizationDetailsType;

      try {
        const updatedOrganization = await organizationService.updateOrganization(customerId, data);
        reply.send(updatedOrganization);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Organization not found') {
            reply.status(404).send({ error: error.message });
          } else {
            // OrganizationError (invalid shortname -> 400, duplicate -> 409) carries its own status.
            const statusCode = typeof (error as any).statusCode === 'number' ? (error as any).statusCode : 400;
            reply.status(statusCode).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error updating organization details:', error);
      reply.status(500).send({ error: 'Error updating organization details' });
    }
  }
};

import { FastifyRequest, FastifyReply } from 'fastify';
import { reportService } from './report.service';
import { loggerService } from '../../module/logger/logger.service';

function getCustomerId(request: FastifyRequest, reply: FastifyReply): string | null {
  const customerId =
    (request.user?.customerId as string | undefined) ||
    (request.headers['x-customer-id'] as string | undefined);
  if (!customerId) {
    reply.status(400).send({ error: 'Customer ID is required' });
    return null;
  }
  return customerId;
}

export const reportController = {
  getAuditLogs: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request, reply);
      if (!customerId) return;
      reply.send(await reportService.auditLogs(customerId));
    } catch (error) {
      loggerService.error('Error building audit-logs report:', error);
      reply.status(500).send({ error: 'Error building audit logs report' });
    }
  },

  getUserActivity: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request, reply);
      if (!customerId) return;
      reply.send(await reportService.userActivity(customerId));
    } catch (error) {
      loggerService.error('Error building user-activity report:', error);
      reply.status(500).send({ error: 'Error building user activity report' });
    }
  },

  getResourceUsage: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request, reply);
      if (!customerId) return;
      reply.send(await reportService.resourceUsage(customerId));
    } catch (error) {
      loggerService.error('Error building resource-usage report:', error);
      reply.status(500).send({ error: 'Error building resource usage report' });
    }
  },

  getSecurityOverview: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request, reply);
      if (!customerId) return;
      reply.send(await reportService.securityOverview(customerId));
    } catch (error) {
      loggerService.error('Error building security-overview report:', error);
      reply.status(500).send({ error: 'Error building security overview report' });
    }
  },

  getCompliance: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = getCustomerId(request, reply);
      if (!customerId) return;
      reply.send(await reportService.compliance(customerId));
    } catch (error) {
      loggerService.error('Error building compliance report:', error);
      reply.status(500).send({ error: 'Error building compliance report' });
    }
  },
};

import { FastifyInstance } from 'fastify';
import { reportController } from './report.controller';
import { hasPermission } from '../../middlewares/authMiddleware';
// MCP/API-key access (2026-07-23): reports accept a portal JWT or a role-bound
// API key; the report:read RBAC gate applies identically to both.
import { verifyAuthOrApiKey } from '../../middlewares/apiKeyMiddleware';
import { extractCustomerId } from '../../middlewares/customerMiddleware';

/**
 * Tenant-scoped Reports API. Every endpoint aggregates REAL data for the
 * caller's tenant (customerId from the verified token) into the shapes the
 * client Reports pages render. Guarded by the standard tenant chain +
 * `report:read`. Response schemas are intentionally omitted so the full
 * aggregated payload passes through Fastify serialization unmodified.
 */
export async function reportRoutes(fastify: FastifyInstance) {
  const preHandler = [verifyAuthOrApiKey, extractCustomerId, hasPermission('report', 'read')];

  fastify.get('/audit-logs', {
    schema: { tags: ['reports'], summary: 'Tenant audit-logs report (unified activity feed)' },
    preHandler,
    handler: reportController.getAuditLogs,
  });

  fastify.get('/user-activity', {
    schema: { tags: ['reports'], summary: 'Tenant user-activity report (stats, sessions, actions)' },
    preHandler,
    handler: reportController.getUserActivity,
  });

  fastify.get('/resource-usage', {
    schema: { tags: ['reports'], summary: 'Tenant resource-usage report (real inventory)' },
    preHandler,
    handler: reportController.getResourceUsage,
  });

  fastify.get('/security-overview', {
    schema: { tags: ['reports'], summary: 'Tenant security-overview report (derived posture)' },
    preHandler,
    handler: reportController.getSecurityOverview,
  });

  fastify.get('/compliance', {
    schema: { tags: ['reports'], summary: 'Tenant compliance report (frameworks + controls)' },
    preHandler,
    handler: reportController.getCompliance,
  });
}

export default reportRoutes;

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { configurationHistoryService } from './configuration-history.service';
import { loggerService } from '../logger/logger.service';
// Import auth middleware - only verifyToken needed as customerId comes from JWT
import { verifyToken } from '../../middlewares/authMiddleware';

// Define types for request parameters and body
interface GetHistoryQuery {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  deployState?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
  page?: string;
  limit?: string;
}

interface IdParams {
  id: string;
}

interface RejectBody {
  reason?: string;
}

interface RevertBody {
  versionId: string;
}

export default async function configurationHistoryController(
  fastify: FastifyInstance
) {
  const logger = loggerService;

  // GET /api/configuration-history
  // Fetch history with optional filters and pagination
  fastify.get<{ Querystring: GetHistoryQuery }>(
    '/',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest<{ Querystring: GetHistoryQuery }>, reply: FastifyReply) => {
      const customerId = request.user.customerId;

      try {
        // Parse filters from query params
        const filters: any = {};
        if (request.query.action) {
          filters.action = request.query.action.split(',');
        }
        if (request.query.entityType) {
          filters.entityType = request.query.entityType.split(',');
        }
        if (request.query.entityId) {
          filters.entityId = request.query.entityId;
        }
        if (request.query.userId) {
          filters.userId = request.query.userId;
        }
        if (request.query.deployState) {
          filters.deployState = request.query.deployState.split(',');
        }
        if (request.query.startDate) {
          filters.startDate = request.query.startDate;
        }
        if (request.query.endDate) {
          filters.endDate = request.query.endDate;
        }
        if (request.query.searchTerm) {
          filters.searchTerm = request.query.searchTerm;
        }

        // Parse pagination
        const pagination = {
          page: request.query.page ? parseInt(request.query.page, 10) : 1,
          limit: request.query.limit ? parseInt(request.query.limit, 10) : 50,
        };

        const history = await configurationHistoryService.getHistory(
          customerId,
          filters,
          pagination
        );
        return reply.send(history);
      } catch (error) {
        logger.error('Error fetching configuration history', { error });
        return reply
          .status(500)
          .send({ error: 'Failed to fetch configuration history' });
      }
    }
  );

  // GET /api/configuration-history/pending-approvals
  // Get pending approvals
  fastify.get<{ Querystring: { entityType?: string; entityId?: string } }>(
    '/pending-approvals',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;

      try {
        const approvals = await configurationHistoryService.getPendingApprovals(
          customerId,
          request.query.entityType,
          request.query.entityId
        );
        return reply.send(approvals);
      } catch (error) {
        logger.error('Error fetching pending approvals', { error });
        return reply
          .status(500)
          .send({ error: 'Failed to fetch pending approvals' });
      }
    }
  );

  // GET /api/configuration-history/entity-types
  // Get available entity types for filter dropdown
  fastify.get(
    '/entity-types',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;

      try {
        const entityTypes =
          await configurationHistoryService.getEntityTypes(customerId);
        return reply.send(entityTypes);
      } catch (error) {
        logger.error('Error fetching entity types', { error });
        return reply.status(500).send({ error: 'Failed to fetch entity types' });
      }
    }
  );

  // GET /api/configuration-history/users
  // Get available users for filter dropdown
  fastify.get(
    '/users',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;

      try {
        const users = await configurationHistoryService.getUsers(customerId);
        return reply.send(users);
      } catch (error) {
        logger.error('Error fetching users', { error });
        return reply.status(500).send({ error: 'Failed to fetch users' });
      }
    }
  );

  // GET /api/configuration-history/:id
  // Get a single history entry by ID
  fastify.get<{ Params: IdParams }>(
    '/:id',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;
      const { id } = request.params;

      try {
        const entry = await configurationHistoryService.getHistoryById(
          id,
          customerId
        );
        if (!entry) {
          return reply.status(404).send({ error: 'Entry not found' });
        }
        return reply.send(entry);
      } catch (error) {
        logger.error('Error fetching history entry', { error, id });
        return reply.status(500).send({ error: 'Failed to fetch history entry' });
      }
    }
  );

  // POST /api/configuration-history
  // Create a new history entry (internal use for logging)
  fastify.post(
    '/',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const customerId = request.user.customerId;
      const userId = request.user.id;

      if (!userId) {
        logger.error('User ID missing when trying to create history entry');
        return reply.status(400).send({ error: 'User context missing' });
      }

      try {
        const historyData = request.body as any;

        // Add userId and customerId from context if not present in body
        historyData.userId = historyData.userId || userId;
        historyData.customerId = historyData.customerId || customerId;

        // Validate required fields
        if (
          !historyData.action ||
          !historyData.entityType ||
          !historyData.entityId ||
          !historyData.userId ||
          !historyData.customerId
        ) {
          return reply
            .status(400)
            .send({ error: 'Missing required fields for history entry' });
        }

        const newEntry =
          await configurationHistoryService.createHistoryEntry(historyData);
        return reply.status(201).send(newEntry);
      } catch (error) {
        logger.error('Error creating configuration history entry', { error });
        return reply.status(500).send({ error: 'Failed to create history entry' });
      }
    }
  );

  // POST /api/configuration-history/approve/:id
  // Approve a pending change
  fastify.post<{ Params: IdParams }>(
    '/approve/:id',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;
      const userId = request.user.id;
      const { id } = request.params;

      try {
        const result = await configurationHistoryService.approve(
          id,
          customerId,
          userId
        );
        return reply.send(result);
      } catch (error: any) {
        logger.error('Error approving configuration change', { error, id });
        if (error.message === 'Entry not found or not pending approval') {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: 'Failed to approve configuration change' });
      }
    }
  );

  // POST /api/configuration-history/reject/:id
  // Reject a pending change
  fastify.post<{ Params: IdParams; Body: RejectBody }>(
    '/reject/:id',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;
      const userId = request.user.id;
      const { id } = request.params;
      const { reason } = request.body || {};

      try {
        const result = await configurationHistoryService.reject(
          id,
          customerId,
          userId,
          reason
        );
        return reply.send(result);
      } catch (error: any) {
        logger.error('Error rejecting configuration change', { error, id });
        if (error.message === 'Entry not found or not pending approval') {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(500)
          .send({ error: 'Failed to reject configuration change' });
      }
    }
  );

  // POST /api/configuration-history/revert
  // Revert to a previous version
  fastify.post<{ Body: RevertBody }>(
    '/revert',
    { preHandler: [verifyToken] },
    async (request, reply) => {
      const customerId = request.user.customerId;
      const userId = request.user.id;
      const { versionId } = request.body;

      if (!versionId) {
        return reply.status(400).send({ error: 'versionId is required' });
      }

      try {
        const result = await configurationHistoryService.revert(
          versionId,
          customerId,
          userId
        );
        return reply.send(result);
      } catch (error: any) {
        logger.error('Error reverting to version', { error, versionId });
        if (error.message === 'Version not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: 'Failed to revert to version' });
      }
    }
  );
}

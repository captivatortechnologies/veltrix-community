import { FastifyRequest, FastifyReply } from 'fastify';
import { connectivityService } from './connectivity.service';
import {
  ConnectivityCreateRequestType,
  ConnectivityUpdateRequestType,
  ComponentIdParamsType
} from './connectivity.schema';
import { loggerService } from '../../module/logger/logger.service';

// SECURITY: this controller used to derive the tenant scope from a
// client-supplied `x-customer-id` header — trivially spoofable by any caller
// — and fell back to a hardcoded placeholder tenant id when the header was
// absent, which would silently read/write another tenant's connectivity
// records. `connectivity.route.ts` already applies `verifyToken` as a global
// preHandler, so `request.user.customerId` (from the verified JWT) is always
// populated here; every handler below uses that instead, matching the
// pattern used by component.controller.ts and every other tenant-scoped
// controller in this codebase.
interface RequestWithUser extends FastifyRequest {
  user?: {
    id: string;
    customerId: string;
    roleId: string;
    role?: string;
  };
}

function requireCustomerId(request: RequestWithUser, reply: FastifyReply): string | undefined {
  const customerId = request.user?.customerId;
  if (!customerId) {
    reply.status(401).send({ error: 'Unauthorized: authenticated customer context missing.' });
    return undefined;
  }
  return customerId;
}

export const connectivityController = {
  // Get connectivity for a specific component
  getConnectivityByComponentId: async (
    request: RequestWithUser & FastifyRequest<{ Params: ComponentIdParamsType }>,
    reply: FastifyReply
  ) => {
    try {
      const { componentId } = request.params;
      const customerId = requireCustomerId(request, reply);
      if (!customerId) return;

      try {
        const connectivity = await connectivityService.getConnectivityByComponentId(componentId, customerId);
        reply.send(connectivity);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Component not found or access denied') {
            reply.status(404).send({ error: error.message });
          } else if (error.message === 'Connectivity not found for this component') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error fetching connectivity:', error);
      reply.status(500).send({ error: 'Error fetching connectivity' });
    }
  },

  // Create or update connectivity for a component
  createOrUpdateConnectivity: async (request: RequestWithUser, reply: FastifyReply) => {
    try {
      const data = request.body as ConnectivityCreateRequestType;
      const customerId = requireCustomerId(request, reply);
      if (!customerId) return;

      try {
        const connectivity = await connectivityService.createOrUpdateConnectivity(data, customerId);
        reply.status(201).send(connectivity);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Component not found or access denied') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error creating/updating connectivity:', error);
      reply.status(500).send({ error: 'Error creating/updating connectivity' });
    }
  },

  // Update connectivity by component ID
  updateConnectivity: async (
    request: RequestWithUser & FastifyRequest<{ Params: ComponentIdParamsType }>,
    reply: FastifyReply
  ) => {
    try {
      const { componentId } = request.params;
      const data = request.body as ConnectivityUpdateRequestType;
      const customerId = requireCustomerId(request, reply);
      if (!customerId) return;

      try {
        const connectivity = await connectivityService.updateConnectivity(componentId, data, customerId);
        reply.send(connectivity);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Component not found or access denied') {
            reply.status(404).send({ error: error.message });
          } else if (error.message === 'Connectivity not found for this component') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error updating connectivity:', error);
      reply.status(500).send({ error: 'Error updating connectivity' });
    }
  },

  // Delete connectivity by component ID
  deleteConnectivity: async (
    request: RequestWithUser & FastifyRequest<{ Params: ComponentIdParamsType }>,
    reply: FastifyReply
  ) => {
    try {
      const { componentId } = request.params;
      const customerId = requireCustomerId(request, reply);
      if (!customerId) return;

      try {
        await connectivityService.deleteConnectivity(componentId, customerId);
        reply.send({ message: 'Connectivity deleted successfully' });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Component not found or access denied') {
            reply.status(404).send({ error: error.message });
          } else if (error.message === 'Connectivity not found for this component') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error deleting connectivity:', error);
      reply.status(500).send({ error: 'Error deleting connectivity' });
    }
  },

  // Regenerate TailScale key
  regenerateTailscaleKey: async (
    request: RequestWithUser & FastifyRequest<{ Params: ComponentIdParamsType }>,
    reply: FastifyReply
  ) => {
    try {
      const { componentId } = request.params;
      const customerId = requireCustomerId(request, reply);
      if (!customerId) return;

      try {
        const connectivity = await connectivityService.regenerateTailscaleKey(componentId, customerId);
        reply.send(connectivity);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Component not found or access denied') {
            reply.status(404).send({ error: error.message });
          } else if (error.message === 'Connectivity not found for this component') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error regenerating TailScale key:', error);
      reply.status(500).send({ error: 'Error regenerating TailScale key' });
    }
  }
};

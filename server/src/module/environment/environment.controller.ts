import { FastifyRequest, FastifyReply } from 'fastify';
import { environmentService } from './environment.service';
import {
  CreateEnvironmentBody,
  UpdateEnvironmentBody,
  UpdatePolicyBody,
  EnvironmentIdParams,
  EnvironmentError,
} from './environment.schema';
import { loggerService } from '../../module/logger/logger.service';

// Map a thrown error to an HTTP response.
function fail(reply: FastifyReply, error: unknown, fallback: string) {
  if (error instanceof EnvironmentError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  loggerService.error(`${fallback}:`, error);
  return reply.status(500).send({ error: fallback });
}

// Pull the tenant's customerId from the verified token.
function requireCustomer(request: FastifyRequest, reply: FastifyReply): string | null {
  if (!request.user || !request.user.customerId) {
    reply.status(401).send({ error: 'Authentication required' });
    return null;
  }
  return request.user.customerId;
}

export const environmentController = {
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      const environments = await environmentService.list(customerId);
      reply.send(environments);
    } catch (error) {
      fail(reply, error, 'Error fetching environments');
    }
  },

  create: async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      const created = await environmentService.create(customerId, request.body as CreateEnvironmentBody);
      reply.status(201).send(created);
    } catch (error) {
      fail(reply, error, 'Error creating environment');
    }
  },

  update: async (
    request: FastifyRequest<{ Params: EnvironmentIdParams }>,
    reply: FastifyReply,
  ) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      const updated = await environmentService.update(
        request.params.id,
        customerId,
        request.body as UpdateEnvironmentBody,
      );
      reply.send(updated);
    } catch (error) {
      fail(reply, error, 'Error updating environment');
    }
  },

  remove: async (
    request: FastifyRequest<{ Params: EnvironmentIdParams }>,
    reply: FastifyReply,
  ) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      await environmentService.remove(request.params.id, customerId);
      reply.send({ message: 'Environment deleted successfully' });
    } catch (error) {
      fail(reply, error, 'Error deleting environment');
    }
  },

  getPolicy: async (
    request: FastifyRequest<{ Params: EnvironmentIdParams }>,
    reply: FastifyReply,
  ) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      const policy = await environmentService.getPolicy(request.params.id, customerId);
      reply.send(policy);
    } catch (error) {
      fail(reply, error, 'Error fetching environment policy');
    }
  },

  upsertPolicy: async (
    request: FastifyRequest<{ Params: EnvironmentIdParams }>,
    reply: FastifyReply,
  ) => {
    const customerId = requireCustomer(request, reply);
    if (!customerId) return;
    try {
      const policy = await environmentService.upsertPolicy(
        request.params.id,
        customerId,
        request.body as UpdatePolicyBody,
      );
      reply.send(policy);
    } catch (error) {
      fail(reply, error, 'Error updating environment policy');
    }
  },
};

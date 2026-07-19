import { FastifyRequest, FastifyReply } from 'fastify';
import { credentialService, redactCredential } from './credential.service';
import {
  CredentialCreateRequestType,
  CredentialUpdateRequestType,
  ToolIdParamsType,
  CredentialIdParamsType
} from './credential.schema';
import { loggerService } from '../../module/logger/logger.service';

/** Local view of the authenticated principal (populated by verifyToken). */
interface RequestWithUser extends FastifyRequest {
  user?: { id: string; customerId: string; roleId: string; role?: string };
}

export const credentialController = {
  // Get all credentials for a specific tool
  getCredentialsByToolId: async (request: RequestWithUser & FastifyRequest<{ Params: ToolIdParamsType }>, reply: FastifyReply) => {
    try {
      const { toolId } = request.params;
      // Tools are a GLOBAL catalog (one "Splunk Enterprise" Tool shared across
      // tenants via CustomerTool links), so credentials MUST be scoped to the
      // caller's customer here — listing by toolId alone returned every
      // tenant's connections for that tool (names/usernames/endpoints), a
      // cross-tenant exposure. See _ai_tasks/mssp-simulation-agent/2026-07-11/
      // 02_findings.md.
      const customerId = request.user?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }

      const credentials = await credentialService.getCredentialsByToolId(toolId, customerId);
      reply.send(credentials.map(redactCredential));
    } catch (error) {
      loggerService.error('Error fetching credentials:', error);
      reply.status(500).send({ error: 'Error fetching credentials' });
    }
  },
  
  // Get credential by ID
  getCredentialById: async (request: RequestWithUser & FastifyRequest<{ Params: CredentialIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const customerId = request.user?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }

      // Scope by customer so a known/guessed id from another tenant 404s.
      const credential = await credentialService.getCredentialById(id, customerId);

      if (!credential) {
        return reply.status(404).send({ error: 'Credential not found' });
      }

      reply.send(redactCredential(credential));
    } catch (error) {
      loggerService.error('Error fetching credential:', error);
      reply.status(500).send({ error: 'Error fetching credential' });
    }
  },
  
  // Create a new credential
  createCredential: async (request: RequestWithUser & FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }

      // Bind the credential to the authenticated tenant. The service otherwise
      // falls back to the all-zeros default customer when the body omits
      // customerId (which the app SDK client always does), so connections were
      // silently created under the WRONG tenant and never showed up for the
      // caller. A client must never be able to target another tenant, so the
      // token's customerId is authoritative — it overrides any body value.
      const data = { ...(request.body as CredentialCreateRequestType), customerId };

      const newCredential = await credentialService.createCredential(data);
      reply.status(201).send(redactCredential(newCredential));
    } catch (error) {
      loggerService.error('Error creating credential:', error);
      
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error creating credential' });
      }
    }
  },
  
  // Update credential by ID
  updateCredential: async (request: RequestWithUser & FastifyRequest<{ Params: CredentialIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const customerId = request.user?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }
      const data = request.body as CredentialUpdateRequestType;

      const updatedCredential = await credentialService.updateCredential(id, data, customerId);
      reply.send(redactCredential(updatedCredential));
    } catch (error) {
      loggerService.error('Error updating credential:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Credential not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error updating credential' });
      }
    }
  },
  
  // Delete credential by ID
  deleteCredential: async (request: RequestWithUser & FastifyRequest<{ Params: CredentialIdParamsType }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const customerId = request.user?.customerId;
      if (!customerId) {
        return reply.status(401).send({ error: 'Unauthorized: Customer context missing.' });
      }

      await credentialService.deleteCredential(id, customerId);
      reply.send({ message: 'Credential deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting credential:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Credential not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting credential' });
      }
    }
  }
};

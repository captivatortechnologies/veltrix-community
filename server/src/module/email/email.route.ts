import { FastifyInstance } from 'fastify';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import { emailController } from './email.controller';
import {
  emailSettingsInputSchema,
  emailSettingsViewSchema,
  testEmailInputSchema,
  testEmailResultSchema,
  errorSchema,
} from './email.schema';

// Instance-level email/SMTP configuration (admin UI). Gated like other
// organization-level settings: read/write on the `organization` resource.
// Registered under /api (see server.ts) -> /api/email-settings.
export async function emailRoutes(fastify: FastifyInstance) {
  const readAuth = [verifyToken, hasPermission('organization', 'read')];
  const writeAuth = [verifyToken, hasPermission('organization', 'write')];

  fastify.get('/email-settings', {
    preHandler: readAuth,
    schema: {
      tags: ['email'],
      summary: 'Get email/SMTP settings (secrets redacted)',
      security: [{ bearerAuth: [] }],
      response: { 200: emailSettingsViewSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema },
    },
    handler: emailController.getSettings,
  });

  fastify.put('/email-settings', {
    preHandler: writeAuth,
    schema: {
      tags: ['email'],
      summary: 'Update email/SMTP settings',
      description: 'Blank secret fields keep the currently-stored value.',
      security: [{ bearerAuth: [] }],
      body: emailSettingsInputSchema,
      response: { 200: emailSettingsViewSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema },
    },
    handler: emailController.updateSettings,
  });

  fastify.post('/email-settings/test', {
    preHandler: writeAuth,
    schema: {
      tags: ['email'],
      summary: 'Send a test email using the supplied (or stored) settings',
      security: [{ bearerAuth: [] }],
      body: testEmailInputSchema,
      response: { 200: testEmailResultSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 500: errorSchema },
    },
    handler: emailController.testEmail,
  });
}

export default emailRoutes;

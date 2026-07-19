import { FastifyRequest, FastifyReply } from 'fastify';
import { emailSettingsService } from './email-settings.service';
import { emailService } from './email.service';
import { loggerService } from '../logger/logger.service';
import type { EmailSettingsInput, TestEmailInput } from './email.schema';

export const emailController = {
  async getSettings(_request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send(await emailSettingsService.getView());
    } catch (error) {
      loggerService.error('Failed to load email settings:', error);
      return reply.status(500).send({ error: 'Failed to load email settings' });
    }
  },

  async updateSettings(request: FastifyRequest<{ Body: EmailSettingsInput }>, reply: FastifyReply) {
    try {
      const view = await emailSettingsService.update(request.body);
      return reply.send(view);
    } catch (error) {
      loggerService.error('Failed to update email settings:', error);
      return reply.status(500).send({ error: 'Failed to update email settings' });
    }
  },

  async testEmail(request: FastifyRequest<{ Body: TestEmailInput }>, reply: FastifyReply) {
    const { to, ...settings } = request.body;
    try {
      const config = await emailSettingsService.buildConfigFromInput(settings);
      const result = await emailService.sendTest(config, to);
      return reply.send({
        delivered: result.delivered,
        provider: result.provider,
        message: `Test email sent to ${to} via ${result.provider}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send test email';
      loggerService.warn(`Email test send failed: ${message}`);
      // 400: the failure is the provider rejecting the (admin-supplied) config,
      // not a server fault — surface the real error to the admin UI.
      return reply.status(400).send({ error: message });
    }
  },
};

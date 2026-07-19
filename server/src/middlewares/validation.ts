import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { z, ZodError, ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validation middleware factory using Zod
 */
export const validate = (schemas: ValidateOptions): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }

      // Validate query parameters
      if (schemas.query) {
        request.query = schemas.query.parse(request.query);
      }

      // Validate route parameters
      if (schemas.params) {
        request.params = schemas.params.parse(request.params);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new ValidationError(
          `Validation failed: ${validationErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`
        );
      }
      throw error;
    }
  };
};

// Common validation schemas
export const commonSchemas = {
  id: z.string().uuid('Invalid ID format'),
  email: z.string().email('Invalid email format'),
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),
};

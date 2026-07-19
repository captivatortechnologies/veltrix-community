import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { loggerService } from '../module/logger/logger.service';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  isOperational = true;

  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends Error implements AppError {
  statusCode = 403;
  code = 'FORBIDDEN';
  isOperational = true;

  constructor(message: string = 'Access forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InternalServerError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  isOperational = false;

  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * Centralized error handler for Fastify
 */
export const errorHandler = (
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const appError = error as AppError;

  // Determine status code
  const statusCode = appError.statusCode || error.statusCode || 500;

  // Log error
  if (statusCode >= 500) {
    loggerService.error('Server error:', {
      error: error.message,
      stack: error.stack,
      path: request.url,
      method: request.method,
      customerId: (request as any).customerId,
      userId: request.user?.id,
    });
  } else {
    loggerService.warn('Client error:', {
      error: error.message,
      path: request.url,
      method: request.method,
      statusCode,
      customerId: (request as any).customerId,
      userId: request.user?.id,
    });
  }

  // Send error response
  reply.status(statusCode).send({
    success: false,
    error: appError.code || 'ERROR',
    message: error.message || 'An error occurred',
    statusCode,
    timestamp: new Date().toISOString(),
    path: request.url,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (reason: any, promise: Promise<any>) => {
  loggerService.error('Unhandled Rejection:', {
    reason,
    promise,
  });

  // In production, you might want to restart the process
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (error: Error) => {
  loggerService.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });

  // In production, gracefully shut down
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
};

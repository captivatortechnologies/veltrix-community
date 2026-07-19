// The canonical `request.user` augmentation lives in
// src/middlewares/authMiddleware.ts (AuthenticatedUser). This file only
// declares the legacy decorated scalars.
declare module 'fastify' {
  interface FastifyRequest {
    customerId?: string;
    userId?: string;
  }
}

export {};

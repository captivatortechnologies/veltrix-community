// API key types and interfaces
import { Static, Type } from '@sinclair/typebox';

// Schema for API key creation
export const CreateApiKeySchema = Type.Object({
  name: Type.String({
    description: 'Name of the API key',
    minLength: 3,
    maxLength: 64
  }),
  type: Type.Union([
    Type.Literal('api'),
    Type.Literal('admin'),
    Type.Literal('webhook')
  ], {
    description: 'Type of API key (api, admin, or webhook)'
  }),
  expiresAt: Type.Optional(Type.String({
    description: 'Expiration date in ISO format',
    format: 'date-time'
  })),
  scopes: Type.Optional(Type.Array(Type.String(), {
    description: 'List of permission scopes for this key'
  })),
  roleId: Type.Optional(Type.String({
    description: "RBAC role id that governs this key's permissions"
  }))
});

// Schema for API key response
export const ApiKeyResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  key: Type.String(),
  type: Type.Union([
    Type.Literal('api'),
    Type.Literal('admin'),
    Type.Literal('webhook')
  ]),
  createdAt: Type.String({ format: 'date-time' }),
  lastUsed: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  expiresAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  revoked: Type.Boolean(),
  scopes: Type.Optional(Type.Array(Type.String())),
  roleId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  roleName: Type.Optional(Type.Union([Type.String(), Type.Null()]))
});

// Schema for regenerating an API key
export const RegenerateApiKeySchema = Type.Object({
  retainName: Type.Optional(Type.Boolean({
    description: 'Whether to keep the existing name',
    default: true
  })),
  expiresAt: Type.Optional(Type.String({
    description: 'New expiration date in ISO format',
    format: 'date-time'
  }))
});

// Schema for updating an API key
export const UpdateApiKeySchema = Type.Object({
  name: Type.Optional(Type.String({
    description: 'New name for the API key',
    minLength: 3,
    maxLength: 64
  })),
  expiresAt: Type.Optional(Type.Union([
    Type.String({
      description: 'New expiration date in ISO format',
      format: 'date-time'
    }),
    Type.Null()
  ])),
  revoked: Type.Optional(Type.Boolean({
    description: 'Whether the API key is revoked'
  })),
  scopes: Type.Optional(Type.Array(Type.String(), {
    description: 'Updated permission scopes for this key'
  }))
});

// Params for API key operations
export const ApiKeyParamsSchema = Type.Object({
  id: Type.String({
    description: 'API key ID'
  })
});

// Type exports for TypeScript
export type CreateApiKeyType = Static<typeof CreateApiKeySchema>;
export type ApiKeyResponseType = Static<typeof ApiKeyResponseSchema>;
export type RegenerateApiKeyType = Static<typeof RegenerateApiKeySchema>;
export type UpdateApiKeyType = Static<typeof UpdateApiKeySchema>;
export type ApiKeyParamsType = Static<typeof ApiKeyParamsSchema>;

// Custom request type with user property
export interface AuthenticatedRequest {
  user: {
    id: string;
    customerId: string;
    roleId: string;
    role?: string;
  };
}

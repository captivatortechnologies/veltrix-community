// Credential types and interfaces

// Credential create request
export interface CredentialCreateRequestType {
  name: string;
  username: string;
  password: string;
  apiToken?: string;
  certificate?: string;
  type?: string;
  /** API base URL / endpoint this connection authenticates to. Not a secret. */
  endpoint?: string;
  toolId: string;
  tagIds: string[];
  customerId?: string;
}

// Credential update request
export interface CredentialUpdateRequestType {
  name?: string;
  username?: string;
  password?: string;
  apiToken?: string;
  certificate?: string;
  type?: string;
  endpoint?: string;
  tagIds?: string[];
}

// Tag response
export interface TagResponseType {
  id: string;
  name: string;
}

// Credential response (internal shape — carries decrypted secrets; must NOT be
// sent over the API. Use RedactedCredentialResponseType at the HTTP boundary).
export interface CredentialResponseType {
  id: string;
  name: string;
  username: string;
  password: string;
  apiToken: string | null;
  certificate?: string | null;
  type: string | null;
  endpoint: string | null;
  toolId: string;
  createdAt: Date;
  updatedAt: Date;
  tags: TagResponseType[];
}

// Redacted credential response — the ONLY credential shape returned over the
// API. Secret material (password/apiToken/certificate) is never included; only
// whether each secret is set is surfaced via the has* flags.
export interface RedactedCredentialResponseType {
  id: string;
  name: string;
  username: string;
  type: string | null;
  endpoint: string | null;
  toolId: string;
  createdAt: Date;
  updatedAt: Date;
  hasPassword: boolean;
  hasApiToken: boolean;
  hasCertificate: boolean;
  tags: TagResponseType[];
}

// Request params
export interface ToolIdParamsType {
  toolId: string;
}

export interface CredentialIdParamsType {
  id: string;
}

// Swagger schemas
export const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  }
};

export const credentialSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    username: { type: 'string' },
    password: { type: 'string' },
    apiToken: { type: 'string', nullable: true },
    certificate: { type: 'string', nullable: true },
    type: { type: 'string', nullable: true },
    toolId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    tags: { 
      type: 'array',
      items: tagSchema
    }
  }
};

// Response schema for every credential-returning endpoint. Deliberately omits
// password/apiToken/certificate so Fastify's serializer strips any secret from
// the response even if the handler object still carries one.
export const redactedCredentialSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    username: { type: 'string' },
    type: { type: 'string', nullable: true },
    endpoint: { type: 'string', nullable: true },
    toolId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    hasPassword: { type: 'boolean' },
    hasApiToken: { type: 'boolean' },
    hasCertificate: { type: 'boolean' },
    tags: {
      type: 'array',
      items: tagSchema
    }
  }
};

export const credentialCreateSchema = {
  type: 'object',
  required: ['name', 'username', 'password', 'toolId', 'tagIds'],
  properties: {
    name: { type: 'string' },
    username: { type: 'string' },
    password: { type: 'string' },
    apiToken: { type: 'string', nullable: true },
    certificate: { type: 'string', nullable: true },
    type: { type: 'string', nullable: true },
    endpoint: { type: 'string', nullable: true },
    toolId: { type: 'string', format: 'uuid' },
    tagIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' }
    },
    customerId: { type: 'string', format: 'uuid', nullable: true }
  }
};

export const credentialUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    username: { type: 'string' },
    password: { type: 'string' },
    apiToken: { type: 'string', nullable: true },
    certificate: { type: 'string', nullable: true },
    type: { type: 'string', nullable: true },
    endpoint: { type: 'string', nullable: true },
    tagIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' }
    }
  }
};

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

export const successMessageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
};

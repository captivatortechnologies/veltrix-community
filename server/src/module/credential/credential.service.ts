import prisma from '../../db';
import {
  CredentialCreateRequestType,
  CredentialUpdateRequestType,
  CredentialResponseType,
  RedactedCredentialResponseType
} from './credential.schema';
import { loggerService } from '../../module/logger/logger.service';
import { encrypt, decrypt, isEncrypted } from '../../utils/encryption';

// SECURITY: this module used to derive its OWN AES key from
// `process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production'`
// independently of utils/encryption.ts — a duplicated, drift-prone key
// derivation with its own public fallback literal. It now reuses the single
// shared encrypt/decrypt from utils/encryption.ts, which fails fast at
// startup when ENCRYPTION_KEY is unset (see that file) rather than silently
// falling back to a known key.

// Secret fields are ALWAYS encrypted at rest, regardless of credential `type`.
//
// The previous implementation gated encryption on the credential's `type`
// (only encrypting apiToken for 'API_KEY'/'TOKEN', certificate for
// 'CERTIFICATE'), which silently stored a secret in plaintext whenever the type
// did not match — a data-at-rest exposure. These helpers remove the type gate:
// every secret is encrypted on write and decrypted on read. Both are made
// idempotent/​backward-compatible via `isEncrypted` — an already-encrypted value
// is not re-encrypted, and a legacy plaintext value (or a non-secret) is
// returned unchanged rather than mangled.

/** Encrypt a secret for storage. No-op for empty values or already-ciphertext. */
const encryptSecret = (value: string | null | undefined): string | null | undefined => {
  if (!value || isEncrypted(value)) return value;
  return encrypt(value);
};

/** Decrypt a stored secret. No-op for empty values or legacy plaintext. */
const decryptSecret = (value: string | null | undefined): string | null | undefined => {
  if (!value || !isEncrypted(value)) return value;
  return decrypt(value);
};

/**
 * Return a copy of a credential-like object with its secret fields decrypted.
 * Use this at every point a credential is read directly from the database
 * (outside this service — e.g. the pipeline engine) before the secrets are
 * handed to code that needs the real values (deploy/drift/sandbox handlers).
 * Non-secret fields are left untouched; legacy plaintext passes through.
 */
export function decryptCredentialSecrets<
  T extends { password?: string | null; apiToken?: string | null; certificate?: string | null }
>(cred: T): T {
  return {
    ...cred,
    password: decryptSecret(cred.password) ?? cred.password,
    apiToken: decryptSecret(cred.apiToken) ?? cred.apiToken,
    certificate: decryptSecret(cred.certificate) ?? cred.certificate,
  };
}

/** Exported for callers that write a credential secret outside this service. */
export { encryptSecret, decryptSecret };

/**
 * Strip all secret material from a credential for return over the API. Only the
 * presence of each secret is surfaced (has* flags) — the plaintext password,
 * apiToken, and certificate never leave the server. Every credential-returning
 * HTTP handler MUST send the output of this, not the raw credential.
 */
export function redactCredential(cred: CredentialResponseType): RedactedCredentialResponseType {
  return {
    id: cred.id,
    name: cred.name,
    username: cred.username,
    type: cred.type,
    endpoint: cred.endpoint ?? null,
    toolId: cred.toolId,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
    hasPassword: Boolean(cred.password && cred.password.length > 0),
    hasApiToken: Boolean(cred.apiToken && cred.apiToken.length > 0),
    hasCertificate: Boolean(cred.certificate && cred.certificate.length > 0),
    tags: cred.tags,
  };
}

export const credentialService = {
  // Get all credentials for a specific tool using raw SQL query
  async getCredentialsByToolId(toolId: string, customerId: string): Promise<CredentialResponseType[]> {
    loggerService.info(`Fetching credentials for tool ID ${toolId} and customer ID ${customerId}`);
    
    // Use raw query instead of Prisma's findMany to avoid schema mismatch
    type RawCredential = {
      id: string;
      name: string;
      username: string | null;
      password: string | null;
      apiToken: string | null; // Changed from key to apiToken to match schema
      secret: string | null;
      token: string | null;
      certificate: string | null;
      expiry: Date | null;
      type: string | null;
      endpoint: string | null;
      customerId: string;
      createdAt: Date;
      updatedAt: Date;
      toolId: string;
    };
    
    // Get credentials safely - scoped to the caller's customer (tools are a
    // global catalog, so toolId alone is NOT a tenant boundary).
    const credentials = await prisma.$queryRaw<RawCredential[]>`
      SELECT * FROM "Credential"
      WHERE "toolId" = ${toolId}
        AND "customerId" = ${customerId}
      ORDER BY name ASC
    `;
    
    // If no credentials found, return empty array
    if (!credentials || credentials.length === 0) {
      return [];
    }
    
    // Get all tags for these credentials
    type TagRelation = {
      credentialId: string;
      tagId: string;
      tagName: string;
    };
    
    // Use parameterized queries to safely handle array of IDs
    const credentialIds = credentials.map(c => c.id);
    const placeholders = credentialIds.map((_, i) => `$${i + 1}`).join(', ');
    
    const tagsQuery = await prisma.$queryRawUnsafe<TagRelation[]>(
      `SELECT ct."credentialId", t.id as "tagId", t.name as "tagName"
       FROM "CredentialTag" ct
       JOIN "Tag" t ON ct."tagId" = t.id
       WHERE ct."credentialId" IN (${placeholders})`,
      ...credentialIds
    );
    
    // Group tags by credential ID
    const tagsByCredential: Record<string, Array<{id: string, name: string}>> = {};
    tagsQuery.forEach(tr => {
      if (!tagsByCredential[tr.credentialId]) {
        tagsByCredential[tr.credentialId] = [];
      }
      tagsByCredential[tr.credentialId].push({
        id: tr.tagId,
        name: tr.tagName
      });
    });
    
    // Transform the response to include tag names and decrypt sensitive data.
    // Secrets are always encrypted at rest now; decryptSecret is a no-op for any
    // legacy plaintext value, so this is safe for pre-existing rows.
    return credentials.map(cred => {
      const decryptedPassword = decryptSecret(cred.password);
      const decryptedApiToken = decryptSecret(cred.apiToken);
      const decryptedCertificate = decryptSecret(cred.certificate);

      return {
        id: cred.id,
        name: cred.name,
        username: cred.username || '', // Convert null to empty string
        password: decryptedPassword || '', // Convert null to empty string
        apiToken: decryptedApiToken,
        certificate: decryptedCertificate,
        type: cred.type,
        endpoint: cred.endpoint ?? null,
        toolId: cred.toolId,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
        tags: tagsByCredential[cred.id] || []
      };
    });
  },
  
  // Get credential by ID
  /**
   * Fetch one credential by id. Pass `customerId` for any request that acts on
   * behalf of a tenant — it scopes the lookup so a caller can't read another
   * tenant's credential by guessing/knowing its id (returns null → the route
   * 404s, without leaking existence). Internal callers that just created or
   * verified the row for the current operation may omit it.
   */
  async getCredentialById(id: string, customerId?: string): Promise<CredentialResponseType | null> {
    loggerService.info(`Fetching credential with ID ${id}${customerId ? ` for customer ID ${customerId}` : ''}`);
    
    // Use raw query to get credential
    type RawCredential = {
      id: string;
      name: string;
      username: string | null;
      password: string | null;
      apiToken: string | null; // Changed from key to apiToken to match schema
      secret: string | null;
      token: string | null;
      certificate: string | null;
      expiry: Date | null;
      type: string | null;
      endpoint: string | null;
      customerId: string;
      createdAt: Date;
      updatedAt: Date;
      toolId: string;
    };
    
    // Scope to the caller's customer when provided (tools/credentials are not a
    // tenant boundary on their own — see getCredentialsByToolId).
    const credentials = customerId
      ? await prisma.$queryRaw<RawCredential[]>`
          SELECT * FROM "Credential" WHERE id = ${id} AND "customerId" = ${customerId}
        `
      : await prisma.$queryRaw<RawCredential[]>`
          SELECT * FROM "Credential" WHERE id = ${id}
        `;

    if (!credentials || credentials.length === 0) {
      return null;
    }
    
    const credential = credentials[0];
    
    // Get tags for this credential
    type TagData = {
      id: string;
      name: string;
    };
    
    const tags = await prisma.$queryRaw<TagData[]>`
      SELECT t.id, t.name
      FROM "Tag" t
      JOIN "CredentialTag" ct ON t.id = ct."tagId"
      WHERE ct."credentialId" = ${id}
    `;
    
    // Decrypt secrets for the response. decryptSecret is a no-op for any legacy
    // plaintext value, so this is safe for pre-existing rows.
    const decryptedPassword = decryptSecret(credential.password);
    const decryptedApiToken = decryptSecret(credential.apiToken);
    const decryptedCertificate = decryptSecret(credential.certificate);
    
    // Return transformed data
    return {
      id: credential.id,
      name: credential.name,
      username: credential.username || '', // Convert null to empty string
      password: decryptedPassword || '', // Convert null to empty string
      apiToken: decryptedApiToken,
      certificate: decryptedCertificate,
      type: credential.type,
      endpoint: credential.endpoint ?? null,
      toolId: credential.toolId,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      tags: tags
    };
  },
  
  // Create a new credential
  async createCredential(data: CredentialCreateRequestType): Promise<CredentialResponseType> {
    loggerService.info(`Creating credential "${data.name}" for tool ID ${data.toolId}`);

    // SECURITY: no silent default tenant. The controller always attaches the
    // authenticated caller's customerId before invoking this service — a
    // missing customerId here means a caller bypassed that (e.g. a direct
    // internal/script call), and attaching the credential to a fixed
    // placeholder tenant would be a cross-tenant data-integrity bug, not a
    // convenience. Fail loudly instead.
    if (!data.customerId) {
      throw new Error('customerId is required to create a credential');
    }
    const credentialCustomerId = data.customerId;

    // Encrypt all secret fields at rest, regardless of credential type.
    const password = encryptSecret(data.password);
    const apiToken = encryptSecret(data.apiToken);
    const certificate = encryptSecret(data.certificate);
    
    // Create credential with raw SQL - fixed column name from key to apiToken
    const result = await prisma.$queryRaw`
      INSERT INTO "Credential" (
        "id", "name", "username", "password", "apiToken", "certificate",
        "type", "endpoint", "toolId", "customerId", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), ${data.name}, ${data.username}, ${password},
        ${apiToken}, ${certificate}, ${data.type}, ${data.endpoint ?? null}, ${data.toolId},
        ${credentialCustomerId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    
    const newCredential = Array.isArray(result) ? result[0] : result;
    
    // Create tag associations
    if (data.tagIds && data.tagIds.length > 0) {
      for (const tagId of data.tagIds) {
        // Check if tag exists
        const tagExists = await prisma.$queryRaw`
          SELECT 1 FROM "Tag" WHERE id = ${tagId}
        `;
        
        if (tagExists && Array.isArray(tagExists) && tagExists.length > 0) {
          // Create credential-tag relationship
          await prisma.$executeRaw`
            INSERT INTO "CredentialTag" ("credentialId", "tagId")
            VALUES (${newCredential.id}, ${tagId})
          `;
        }
      }
    }
    
    // Return the newly created credential with tags
    return this.getCredentialById(newCredential.id) as Promise<CredentialResponseType>;
  },
  
  // Update credential by ID (scoped to the caller's customer)
  async updateCredential(id: string, data: CredentialUpdateRequestType, customerId: string): Promise<CredentialResponseType> {
    loggerService.info(`Updating credential with ID ${id} for customer ID ${customerId}`);

    // Existence check scoped to the caller's customer — a credential id from
    // another tenant resolves to null here and 404s, never updates.
    const existingCredential = await this.getCredentialById(id, customerId);

    if (!existingCredential) {
      throw new Error('Credential not found');
    }
    
    // Build the SQL SET clause dynamically
    const setClauses = [];
    const params = [];
    
    if (data.name !== undefined) {
      setClauses.push(`"name" = $${params.length + 1}`);
      params.push(data.name);
    }
    
    if (data.username !== undefined) {
      setClauses.push(`"username" = $${params.length + 1}`);
      params.push(data.username);
    }
    
    if (data.password !== undefined) {
      setClauses.push(`"password" = $${params.length + 1}`);
      params.push(encryptSecret(data.password));
    }

    if (data.apiToken !== undefined) {
      setClauses.push(`"apiToken" = $${params.length + 1}`);
      params.push(encryptSecret(data.apiToken));
    }

    if (data.certificate !== undefined) {
      setClauses.push(`"certificate" = $${params.length + 1}`);
      params.push(encryptSecret(data.certificate));
    }

    if (data.endpoint !== undefined) {
      setClauses.push(`"endpoint" = $${params.length + 1}`);
      params.push(data.endpoint);
    }
    
    if (data.type !== undefined) {
      setClauses.push(`"type" = $${params.length + 1}`);
      params.push(data.type);
    }
    
    setClauses.push(`"updatedAt" = $${params.length + 1}`);
    params.push(new Date());
    
    // Add credential ID as the last parameter
    params.push(id);
    
    // Update credential if there are fields to update
    if (setClauses.length > 0) {
      // Convert to a raw SQL query string
      let sqlQuery = `UPDATE "Credential" SET ${setClauses.join(', ')} WHERE "id" = $${params.length}`;
      
      // Use the query and params
      await prisma.$executeRawUnsafe(sqlQuery, ...params);
    }
    
    // If tagIds are provided, update tags
    if (data.tagIds !== undefined) {
      // Delete existing tag connections
      await prisma.$executeRaw`
        DELETE FROM "CredentialTag"
        WHERE "credentialId" = ${id}
      `;
      
      // Create new tag connections
      for (const tagId of data.tagIds) {
        // Check if tag exists
        const tagExists = await prisma.$queryRaw`
          SELECT 1 FROM "Tag" WHERE id = ${tagId}
        `;
        
        if (tagExists && Array.isArray(tagExists) && tagExists.length > 0) {
          // Create credential-tag relationship
          await prisma.$executeRaw`
            INSERT INTO "CredentialTag" ("credentialId", "tagId")
            VALUES (${id}, ${tagId})
          `;
        }
      }
    }
    
    // Return updated credential with tags
    return this.getCredentialById(id, customerId) as Promise<CredentialResponseType>;
  },

  // Delete credential by ID (scoped to the caller's customer)
  async deleteCredential(id: string, customerId: string): Promise<boolean> {
    loggerService.info(`Deleting credential with ID ${id} for customer ID ${customerId}`);

    // Existence check scoped to the caller's customer — a credential id from
    // another tenant 404s here, never deletes.
    const credential = await prisma.$queryRaw`
      SELECT 1 FROM "Credential" WHERE id = ${id} AND "customerId" = ${customerId}
    `;

    if (!credential || !Array.isArray(credential) || credential.length === 0) {
      throw new Error('Credential not found');
    }

    // Delete credential tags first
    await prisma.$executeRaw`
      DELETE FROM "CredentialTag" WHERE "credentialId" = ${id}
    `;

    // Delete credential (customer-scoped for defense in depth)
    await prisma.$executeRaw`
      DELETE FROM "Credential" WHERE id = ${id} AND "customerId" = ${customerId}
    `;

    return true;
  },
  
  // Get tool ID for a credential
  async getToolIdForCredential(credentialId: string): Promise<string | null> {
    try {
      // Use raw SQL to avoid schema mismatch issues
      const result = await prisma.$queryRaw<Array<{ toolId: string }>>`
        SELECT "toolId" FROM "Credential" WHERE id = ${credentialId}
      `;
      
      return result && result.length > 0 ? result[0].toolId : null;
    } catch (error) {
      loggerService.error('Error getting toolId for credential:', error);
      return null;
    }
  }
};

/**
 * JSON Serialization Utilities
 * 
 * Custom JSON serializers for optimized API response times.
 * Handles large payloads efficiently by streaming, compressing, and
 * selectively serializing data based on payload size and structure.
 * 
 * @module json-serialization
 */

import { FastifyReply } from 'fastify';

/**
 * JSON Serialization Options
 */
export interface SerializationOptions {
  /** Maximum depth for nested objects (prevents circular references) */
  maxDepth?: number;
  /** Fields to exclude from serialization */
  excludeFields?: string[];
  /** Fields to include (if specified, only these fields are serialized) */
  includeFields?: string[];
  /** Whether to use pretty printing (development only) */
  pretty?: boolean;
  /** Custom replacer function for special types */
  replacer?: (key: string, value: unknown) => unknown;
}

/**
 * Custom JSON replacer for handling special types
 */
export function createReplacer(options: SerializationOptions = {}) {
  const { maxDepth = 10, excludeFields = [], replacer } = options;
  const seen = new WeakSet<object>();
  let depth = 0;

  return function (this: unknown, key: string, value: unknown): unknown {
    // Exclude specified fields
    if (excludeFields.includes(key)) {
      return undefined;
    }

    // Handle custom replacer first
    if (replacer) {
      const replaced = replacer.call(this, key, value);
      if (replaced !== value) {
        return replaced;
      }
    }

    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    // Limit depth to prevent stack overflow
    if (key && depth++ > maxDepth) {
      return '[Max Depth Exceeded]';
    }

    // Convert Date objects to ISO strings
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Convert BigInt to string (JSON doesn't support BigInt)
    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Convert Buffer to base64 string
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    // Convert Error objects to plain objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: process.env.NODE_ENV === 'development' ? value.stack : undefined
      };
    }

    // Handle Map
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }

    // Handle Set
    if (value instanceof Set) {
      return Array.from(value);
    }

    depth--;
    return value;
  };
}

/**
 * Optimized JSON stringify for large payloads
 */
export function stringify(
  value: unknown,
  options: SerializationOptions = {}
): string {
  const { pretty = false, includeFields } = options;

  // If includeFields is specified, filter the object first
  let filteredValue = value;
  if (includeFields && typeof value === 'object' && value !== null) {
    filteredValue = Object.keys(value).reduce((acc, key) => {
      if (includeFields.includes(key)) {
        acc[key] = (value as Record<string, unknown>)[key];
      }
      return acc;
    }, {} as Record<string, unknown>);
  }

  const replacer = createReplacer(options);
  const space = pretty ? 2 : undefined;

  return JSON.stringify(filteredValue, replacer, space);
}

/**
 * Stream large JSON responses to avoid memory issues
 */
export async function streamJsonResponse(
  reply: FastifyReply,
  data: unknown[],
  options: SerializationOptions = {}
): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked'
  });

  const replacer = createReplacer(options);

  // Write opening bracket
  reply.raw.write('[');

  // Stream each item
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const json = JSON.stringify(item, replacer);
    
    reply.raw.write(json);
    
    // Add comma between items (but not after last item)
    if (i < data.length - 1) {
      reply.raw.write(',');
    }
  }

  // Write closing bracket
  reply.raw.write(']');
  reply.raw.end();
}

/**
 * Optimize response size by removing null/undefined fields
 */
export function removeEmptyFields<T extends Record<string, unknown>>(
  obj: T
): Partial<T> {
  const result: Partial<T> = {};

  for (const key in obj) {
    const value = obj[key];
    
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = removeEmptyFields(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        result[key] = nested as T[Extract<keyof T, string>];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Serialize with field selection (similar to GraphQL field selection)
 */
export function selectFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): Partial<T> {
  const result: Partial<T> = {};

  for (const field of fields) {
    // Handle nested fields (e.g., "user.name")
    if (field.includes('.')) {
      const [parent, ...rest] = field.split('.');
      const parentValue = obj[parent];
      
      if (typeof parentValue === 'object' && parentValue !== null) {
        if (!result[parent as keyof T]) {
          result[parent as keyof T] = {} as T[Extract<keyof T, string>];
        }
        
        const nested = selectFields(
          parentValue as Record<string, unknown>,
          [rest.join('.')]
        );
        
        Object.assign(result[parent as keyof T], nested);
      }
    } else if (field in obj) {
      result[field as keyof T] = obj[field] as T[keyof T];
    }
  }

  return result;
}

/**
 * Paginated JSON serialization for large datasets
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function serializePaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  options: SerializationOptions = {}
): string {
  const totalPages = Math.ceil(total / limit);
  
  const response: PaginatedResponse<T> = {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };

  return stringify(response, options);
}

/**
 * Fast serialization for simple objects (no nested structures)
 */
export function fastStringify(obj: Record<string, string | number | boolean>): string {
  const pairs: string[] = [];

  for (const key in obj) {
    const value = obj[key];
    
    if (typeof value === 'string') {
      // Escape quotes in string values
      pairs.push(`"${key}":"${value.replace(/"/g, '\\"')}"`);
    } else {
      pairs.push(`"${key}":${value}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

/**
 * Lazy serialization - only serialize fields when accessed
 */
export class LazySerializer<T extends Record<string, unknown>> {
  private data: T;
  private serialized: Map<string, string>;
  private options: SerializationOptions;

  constructor(data: T, options: SerializationOptions = {}) {
    this.data = data;
    this.serialized = new Map();
    this.options = options;
  }

  /**
   * Get serialized value for a specific field
   */
  getField(field: keyof T): string {
    const key = String(field);
    
    if (!this.serialized.has(key)) {
      const value = this.data[field];
      const replacer = createReplacer(this.options);
      this.serialized.set(key, JSON.stringify(value, replacer));
    }

    return this.serialized.get(key)!;
  }

  /**
   * Get all serialized fields
   */
  getAll(): string {
    return stringify(this.data, this.options);
  }

  /**
   * Get only requested fields
   */
  getFields(fields: (keyof T)[]): string {
    const selected = selectFields(this.data, fields.map(String));
    return stringify(selected, this.options);
  }
}

/**
 * Benchmark serialization performance
 */
export function benchmarkSerialization(
  data: unknown,
  options: SerializationOptions = {}
): { duration: number; size: number } {
  const start = process.hrtime.bigint();
  const json = stringify(data, options);
  const end = process.hrtime.bigint();
  
  const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
  const size = Buffer.byteLength(json, 'utf8');

  return { duration, size };
}

/**
 * Create a Fastify serializer plugin
 */
export function createSerializerPlugin(options: SerializationOptions = {}) {
  return {
    stringify: (value: unknown) => stringify(value, options),
    parse: JSON.parse
  };
}

export default {
  stringify,
  streamJsonResponse,
  removeEmptyFields,
  selectFields,
  serializePaginatedResponse,
  fastStringify,
  LazySerializer,
  benchmarkSerialization,
  createSerializerPlugin
};

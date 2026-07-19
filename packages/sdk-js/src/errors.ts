/**
 * Base error class for Veltrix SDK specific errors.
 */
export class VeltrixError extends Error {
  readonly httpStatus?: number;
  readonly requestId?: string;
  readonly code?: string; // Optional API-specific error code
  readonly errorData?: any; // Raw error data from API

  constructor(message: string, options?: { httpStatus?: number; requestId?: string; code?: string; errorData?: any }) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    this.httpStatus = options?.httpStatus;
    this.requestId = options?.requestId;
    this.code = options?.code;
    this.errorData = options?.errorData;

    // Maintains proper stack trace in V8 environments (Chrome, Node.js)
    // Use type assertion to acknowledge non-standard property access
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Represents errors originating from the Veltrix API itself.
 */
export class APIError extends VeltrixError {}

/**
 * Represents authentication errors (e.g., invalid API key, 401 Unauthorized).
 */
export class AuthenticationError extends APIError {}

/**
 * Represents permission errors (e.g., insufficient permissions, 403 Forbidden).
 */
export class PermissionError extends APIError {}

/**
 * Represents errors when a requested resource is not found (404 Not Found).
 */
export class NotFoundError extends APIError {}

/**
 * Represents errors due to rate limiting (429 Too Many Requests).
 */
export class RateLimitError extends APIError {}

/**
 * Represents errors due to invalid request parameters (400 Bad Request).
 */
export class BadRequestError extends APIError {}

/**
 * Represents errors originating from the Veltrix server (5xx errors).
 */
export class ServerError extends APIError {}

/**
 * Represents errors during the HTTP request process itself (e.g., network issues).
 */
export class RequestError extends VeltrixError {}

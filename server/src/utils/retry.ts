/**
 * Retry utility with exponential backoff for external API calls
 */

import { loggerService } from '../module/logger/logger.service';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: (error: any) => {
    // Retry on network errors and 5xx server errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response && error.response.status >= 500 && error.response.status < 600) {
      return true;
    }
    // Retry on rate limit errors (429)
    if (error.response && error.response.status === 429) {
      return true;
    }
    return false;
  },
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry'>>): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  
  // Add jitter (random factor between 0.5 and 1.5)
  const jitter = 0.5 + Math.random();
  return Math.floor(cappedDelay * jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @example
 * ```typescript
 * const result = await retry(
 *   () => axios.get('https://api.example.com/data'),
 *   { maxRetries: 5, initialDelayMs: 500 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === opts.maxRetries) {
        loggerService.error(`Retry failed after ${opts.maxRetries} attempts`, { error });
        throw error;
      }

      // Check if error is retryable
      if (!opts.retryableErrors(error)) {
        loggerService.warn('Non-retryable error encountered', { error });
        throw error;
      }

      // Calculate delay for next retry
      const delay = calculateDelay(attempt, opts);

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(error, attempt + 1);
      }

      loggerService.info(`Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
        attempt: attempt + 1,
        delay,
      });

      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError;
}

/**
 * Retry with custom retryable condition
 * 
 * @example
 * ```typescript
 * const result = await retryIf(
 *   () => axios.get('https://api.example.com/data'),
 *   (error) => error.response?.status === 503,
 *   { maxRetries: 5 }
 * );
 * ```
 */
export async function retryIf<T>(
  fn: () => Promise<T>,
  condition: (error: any) => boolean,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<T> {
  return retry(fn, {
    ...options,
    retryableErrors: condition,
  });
}

/**
 * Retry only on specific HTTP status codes
 * 
 * @example
 * ```typescript
 * const result = await retryOnStatus(
 *   () => axios.get('https://api.example.com/data'),
 *   [500, 502, 503, 504],
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function retryOnStatus<T>(
  fn: () => Promise<T>,
  statusCodes: number[],
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<T> {
  return retry(fn, {
    ...options,
    retryableErrors: (error: any) => {
      if (error.response && statusCodes.includes(error.response.status)) {
        return true;
      }
      return false;
    },
  });
}

/**
 * Retry with circuit breaker pattern
 * Opens circuit after consecutive failures and closes after timeout
 */
export class CircuitBreaker<T> {
  private failureCount = 0;
  private lastFailureTime?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private fn: () => Promise<T>,
    private options: {
      failureThreshold?: number;
      resetTimeoutMs?: number;
      retryOptions?: RetryOptions;
    } = {}
  ) {
    this.options.failureThreshold = options.failureThreshold ?? 5;
    this.options.resetTimeoutMs = options.resetTimeoutMs ?? 60000;
  }

  async execute(): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceLastFailure >= (this.options.resetTimeoutMs || 60000)) {
        loggerService.info('Circuit breaker transitioning to half-open state');
        this.state = 'half-open';
      } else {
        throw new Error(`Circuit breaker is open. Retry after ${Math.ceil((this.options.resetTimeoutMs! - timeSinceLastFailure) / 1000)}s`);
      }
    }

    try {
      const result = await retry(this.fn, this.options.retryOptions);
      
      // Success - reset failure count and close circuit
      if (this.state === 'half-open') {
        loggerService.info('Circuit breaker closing after successful request');
      }
      this.failureCount = 0;
      this.state = 'closed';
      
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Check if we should open the circuit
      if (this.failureCount >= (this.options.failureThreshold || 5)) {
        if (this.state === 'closed' || this.state === 'half-open') {
          loggerService.error('Circuit breaker opening after consecutive failures', {
            failureCount: this.failureCount,
            threshold: this.options.failureThreshold,
          });
        }
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastFailureTime = undefined;
    loggerService.info('Circuit breaker manually reset');
  }
}

import Redis, { RedisOptions } from 'ioredis';
import { loggerService } from '../module/logger/logger.service';

class CacheService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      const options: RedisOptions = {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
      };

      this.client = new Redis(redisUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        loggerService.info('Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        loggerService.error('Redis connection error:', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        loggerService.warn('Redis connection closed');
      });
    } catch (error) {
      loggerService.error('Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      loggerService.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const stringValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
      
      return true;
    } catch (error) {
      loggerService.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Atomically fetch-and-delete a key (single Redis `GETDEL` round trip).
   * Use this instead of a separate `get()` + `delete()` pair for any
   * one-time-use value (e.g. OAuth state/nonce consumption) — two separate
   * calls are a genuine TOCTOU race under concurrent callers (two requests
   * can both `get()` the value before either `delete()`s it, so both treat
   * a one-time-use token as valid). Returns null if the key doesn't exist,
   * is expired, or Redis isn't connected.
   */
  async getAndDelete<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.getdel(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      loggerService.error(`Error getting-and-deleting cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      loggerService.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      loggerService.error(`Error deleting cache pattern ${pattern}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      loggerService.error(`Error checking cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      loggerService.error(`Error setting expiration on key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected || !this.client) {
      return -2;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      loggerService.error(`Error getting TTL for key ${key}:`, error);
      return -2;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushall();
      return true;
    } catch (error) {
      loggerService.error('Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Helper function to generate cache keys
export const cacheKeys = {
  tool: (id: string) => `tool:${id}`,
  tools: (filters?: Record<string, any>) => `tools:${JSON.stringify(filters || {})}`,
  user: (id: string) => `user:${id}`,
  customer: (id: string) => `customer:${id}`,
  component: (id: string) => `component:${id}`,
};

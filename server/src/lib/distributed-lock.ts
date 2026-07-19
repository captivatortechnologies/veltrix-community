/**
 * Distributed Lock Manager
 * 
 * Implements Redis-based distributed locks using the Redlock algorithm.
 * Prevents race conditions in multi-server deployments for critical operations.
 */

import Redis from 'ioredis';
import { randomBytes } from 'crypto';

interface LockOptions {
  ttl?: number; // Lock TTL in milliseconds
  retryCount?: number; // Number of retry attempts
  retryDelay?: number; // Delay between retries in milliseconds
  retryJitter?: number; // Random jitter to add to retry delay (0-1)
}

interface Lock {
  resource: string;
  value: string;
  ttl: number;
  acquiredAt: number;
  expiresAt: number;
}

export class DistributedLock {
  private redis: Redis;
  private defaultTTL: number = 30000; // 30 seconds
  private defaultRetryCount: number = 3;
  private defaultRetryDelay: number = 200; // 200ms
  private defaultRetryJitter: number = 0.1; // 10% jitter
  private prefix: string = 'lock:';
  private activeLocks: Map<string, Lock> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Generate unique lock value (prevents unlock by wrong client)
   */
  private generateLockValue(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Get Redis key for lock
   */
  private getLockKey(resource: string): string {
    return `${this.prefix}${resource}`;
  }

  /**
   * Calculate retry delay with jitter
   */
  private getRetryDelay(baseDelay: number, jitter: number): number {
    const jitterAmount = baseDelay * jitter;
    return baseDelay + Math.random() * jitterAmount;
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(resource: string, options: LockOptions = {}): Promise<Lock | null> {
    const {
      ttl = this.defaultTTL,
      retryCount = this.defaultRetryCount,
      retryDelay = this.defaultRetryDelay,
      retryJitter = this.defaultRetryJitter
    } = options;

    const lockValue = this.generateLockValue();
    const lockKey = this.getLockKey(resource);

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // Use SET with NX (only set if not exists) and PX (TTL in milliseconds)
        const result = await this.redis.set(
          lockKey,
          lockValue,
          'PX',
          ttl,
          'NX'
        );

        if (result === 'OK') {
          const now = Date.now();
          const lock: Lock = {
            resource,
            value: lockValue,
            ttl,
            acquiredAt: now,
            expiresAt: now + ttl
          };

          this.activeLocks.set(resource, lock);
          return lock;
        }

        // Lock already held by another client
        if (attempt < retryCount) {
          const delay = this.getRetryDelay(retryDelay, retryJitter);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Failed to acquire lock for ${resource}:`, error);
        throw error;
      }
    }

    // Failed to acquire lock after all retries
    return null;
  }

  /**
   * Release a distributed lock
   */
  async release(lock: Lock): Promise<boolean> {
    const lockKey = this.getLockKey(lock.resource);

    try {
      // Use Lua script to ensure we only delete if we own the lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, lockKey, lock.value);

      if (result === 1) {
        this.activeLocks.delete(lock.resource);
        return true;
      }

      // Lock was already released or acquired by someone else
      return false;
    } catch (error) {
      console.error(`Failed to release lock for ${lock.resource}:`, error);
      throw error;
    }
  }

  /**
   * Extend a lock's TTL (for long-running operations)
   */
  async extend(lock: Lock, additionalTTL: number): Promise<boolean> {
    const lockKey = this.getLockKey(lock.resource);

    try {
      // Use Lua script to extend only if we own the lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(
        script,
        1,
        lockKey,
        lock.value,
        additionalTTL
      );

      if (result === 1) {
        // Update lock metadata
        const now = Date.now();
        lock.ttl = additionalTTL;
        lock.expiresAt = now + additionalTTL;
        this.activeLocks.set(lock.resource, lock);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to extend lock for ${lock.resource}:`, error);
      throw error;
    }
  }

  /**
   * Check if a lock is still valid
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockKey = this.getLockKey(resource);
    const exists = await this.redis.exists(lockKey);
    return exists === 1;
  }

  /**
   * Get lock information
   */
  async getLockInfo(resource: string): Promise<{ locked: boolean; ttl?: number } | null> {
    const lockKey = this.getLockKey(resource);

    try {
      const [exists, ttl] = await Promise.all([
        this.redis.exists(lockKey),
        this.redis.pttl(lockKey)
      ]);

      if (exists === 1 && ttl > 0) {
        return { locked: true, ttl };
      }

      return { locked: false };
    } catch (error) {
      console.error(`Failed to get lock info for ${resource}:`, error);
      return null;
    }
  }

  /**
   * Execute function with automatic lock acquisition and release
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lock = await this.acquire(resource, options);

    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.release(lock);
    }
  }

  /**
   * Execute function with lock, with automatic extension for long operations
   */
  async withAutoExtendingLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions & { extensionInterval?: number } = {}
  ): Promise<T> {
    const {
      ttl = this.defaultTTL,
      extensionInterval = ttl / 2, // Extend at 50% of TTL
      ...lockOptions
    } = options;

    const lock = await this.acquire(resource, { ...lockOptions, ttl });

    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    // Set up auto-extension
    let extensionTimer: NodeJS.Timeout | null = null;
    const startExtension = () => {
      extensionTimer = setInterval(async () => {
        const extended = await this.extend(lock, ttl);
        if (!extended) {
          console.warn(`Failed to extend lock for ${resource}`);
          if (extensionTimer) {
            clearInterval(extensionTimer);
          }
        }
      }, extensionInterval);
    };

    startExtension();

    try {
      const result = await fn();
      return result;
    } finally {
      if (extensionTimer) {
        clearInterval(extensionTimer);
      }
      await this.release(lock);
    }
  }

  /**
   * Force release a lock (admin operation - use with caution)
   */
  async forceRelease(resource: string): Promise<boolean> {
    const lockKey = this.getLockKey(resource);

    try {
      const result = await this.redis.del(lockKey);
      this.activeLocks.delete(resource);
      return result === 1;
    } catch (error) {
      console.error(`Failed to force release lock for ${resource}:`, error);
      throw error;
    }
  }

  /**
   * Get all active locks (for monitoring)
   */
  async getAllLocks(): Promise<string[]> {
    const pattern = `${this.prefix}*`;
    const keys = await this.redis.keys(pattern);
    return keys.map(key => key.replace(this.prefix, ''));
  }

  /**
   * Clean up expired locks from local cache
   */
  cleanupLocalCache(): void {
    const now = Date.now();
    for (const [resource, lock] of this.activeLocks.entries()) {
      if (now > lock.expiresAt) {
        this.activeLocks.delete(resource);
      }
    }
  }

  /**
   * Get statistics about locks
   */
  async getStatistics(): Promise<{
    totalLocks: number;
    activeLocks: Lock[];
    locksByAge: { resource: string; ageMs: number }[];
  }> {
    const resources = await this.getAllLocks();
    const activeLocks: Lock[] = [];
    const locksByAge: { resource: string; ageMs: number }[] = [];

    for (const resource of resources) {
      const info = await this.getLockInfo(resource);
      if (info && info.locked && info.ttl) {
        const lock = this.activeLocks.get(resource);
        if (lock) {
          activeLocks.push(lock);
          const ageMs = Date.now() - lock.acquiredAt;
          locksByAge.push({ resource, ageMs });
        }
      }
    }

    // Sort by age (oldest first)
    locksByAge.sort((a, b) => b.ageMs - a.ageMs);

    return {
      totalLocks: resources.length,
      activeLocks,
      locksByAge
    };
  }
}

export default DistributedLock;

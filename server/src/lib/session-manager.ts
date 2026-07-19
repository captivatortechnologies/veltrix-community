/**
 * Session Manager
 * 
 * Redis-based session management for distributed session storage.
 * Supports multi-tenant isolation, session expiration, and secure session handling.
 */

import Redis from 'ioredis';
import { randomBytes } from 'crypto';

interface SessionData {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  permissions: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

interface SessionOptions {
  /** Session TTL in seconds (default: 86400 - 24 hours) */
  ttl?: number;
  /** Enable sliding expiration (default: true) */
  sliding?: boolean;
  /** Session ID prefix (default: 'sess:') */
  prefix?: string;
}

export class SessionManager {
  private redis: Redis;
  private defaultTTL: number = 604800; // 7 days
  private prefix: string = 'sess:';
  private slidingExpiration: boolean = true;

  constructor(redis: Redis, options: SessionOptions = {}) {
    this.redis = redis;
    this.defaultTTL = options.ttl || this.defaultTTL;
    this.prefix = options.prefix || this.prefix;
    this.slidingExpiration = options.sliding !== false;
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Get Redis key for session
   */
  private getSessionKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  /**
   * Get Redis key for user sessions index
   */
  private getUserSessionsKey(userId: string): string {
    return `${this.prefix}user:${userId}:sessions`;
  }

  /**
   * Get Redis key for tenant sessions index
   */
  private getTenantSessionsKey(tenantId: string): string {
    return `${this.prefix}tenant:${tenantId}:sessions`;
  }

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    tenantId: string,
    data: Omit<SessionData, 'userId' | 'tenantId' | 'createdAt' | 'lastAccessedAt' | 'expiresAt'>,
    ttl?: number
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const sessionKey = this.getSessionKey(sessionId);
    const effectiveTTL = ttl || this.defaultTTL;
    const now = Date.now();

    const sessionData: SessionData = {
      userId,
      tenantId,
      ...data,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + effectiveTTL * 1000
    };

    // Store session data
    const pipeline = this.redis.pipeline();
    pipeline.setex(sessionKey, effectiveTTL, JSON.stringify(sessionData));

    // Add to user sessions index
    pipeline.sadd(this.getUserSessionsKey(userId), sessionId);
    pipeline.expire(this.getUserSessionsKey(userId), effectiveTTL);

    // Add to tenant sessions index
    pipeline.sadd(this.getTenantSessionsKey(tenantId), sessionId);
    pipeline.expire(this.getTenantSessionsKey(tenantId), effectiveTTL);

    await pipeline.exec();

    return sessionId;
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionKey = this.getSessionKey(sessionId);
    const data = await this.redis.get(sessionKey);

    if (!data) {
      return null;
    }

    const sessionData: SessionData = JSON.parse(data);

    // Check if session expired
    if (Date.now() > sessionData.expiresAt) {
      await this.destroySession(sessionId);
      return null;
    }

    // Update last accessed time with sliding expiration
    if (this.slidingExpiration) {
      sessionData.lastAccessedAt = Date.now();
      const remainingTTL = Math.floor((sessionData.expiresAt - Date.now()) / 1000);
      
      if (remainingTTL > 0) {
        await this.redis.setex(sessionKey, remainingTTL, JSON.stringify(sessionData));
      }
    }

    return sessionData;
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Omit<SessionData, 'userId' | 'tenantId' | 'createdAt'>>
  ): Promise<boolean> {
    const sessionData = await this.getSession(sessionId);

    if (!sessionData) {
      return false;
    }

    const updatedData: SessionData = {
      ...sessionData,
      ...updates,
      lastAccessedAt: Date.now()
    };

    const sessionKey = this.getSessionKey(sessionId);
    const remainingTTL = Math.floor((updatedData.expiresAt - Date.now()) / 1000);

    if (remainingTTL <= 0) {
      return false;
    }

    await this.redis.setex(sessionKey, remainingTTL, JSON.stringify(updatedData));
    return true;
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string, additionalTTL?: number): Promise<boolean> {
    const sessionData = await this.getSession(sessionId);

    if (!sessionData) {
      return false;
    }

    const extensionTime = (additionalTTL || this.defaultTTL) * 1000;
    sessionData.expiresAt = Date.now() + extensionTime;
    sessionData.lastAccessedAt = Date.now();

    const sessionKey = this.getSessionKey(sessionId);
    const newTTL = Math.floor(extensionTime / 1000);

    await this.redis.setex(sessionKey, newTTL, JSON.stringify(sessionData));
    return true;
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const sessionData = await this.getSession(sessionId);

    if (!sessionData) {
      return false;
    }

    const pipeline = this.redis.pipeline();

    // Remove session data
    pipeline.del(this.getSessionKey(sessionId));

    // Remove from user sessions index
    pipeline.srem(this.getUserSessionsKey(sessionData.userId), sessionId);

    // Remove from tenant sessions index
    pipeline.srem(this.getTenantSessionsKey(sessionData.tenantId), sessionId);

    await pipeline.exec();
    return true;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    const sessionIds = await this.redis.smembers(this.getUserSessionsKey(userId));
    
    if (!sessionIds.length) {
      return [];
    }

    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    return sessions;
  }

  /**
   * Get all sessions for a tenant
   */
  async getTenantSessions(tenantId: string): Promise<SessionData[]> {
    const sessionIds = await this.redis.smembers(this.getTenantSessionsKey(tenantId));
    
    if (!sessionIds.length) {
      return [];
    }

    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        sessions.push(sessionData);
      }
    }

    return sessions;
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyUserSessions(userId: string): Promise<number> {
    const sessionIds = await this.redis.smembers(this.getUserSessionsKey(userId));
    
    if (!sessionIds.length) {
      return 0;
    }

    let count = 0;
    for (const sessionId of sessionIds) {
      const destroyed = await this.destroySession(sessionId);
      if (destroyed) count++;
    }

    // Clean up user sessions index
    await this.redis.del(this.getUserSessionsKey(userId));

    return count;
  }

  /**
   * Destroy all sessions for a tenant
   */
  async destroyTenantSessions(tenantId: string): Promise<number> {
    const sessionIds = await this.redis.smembers(this.getTenantSessionsKey(tenantId));
    
    if (!sessionIds.length) {
      return 0;
    }

    let count = 0;
    for (const sessionId of sessionIds) {
      const destroyed = await this.destroySession(sessionId);
      if (destroyed) count++;
    }

    // Clean up tenant sessions index
    await this.redis.del(this.getTenantSessionsKey(tenantId));

    return count;
  }

  /**
   * Get active session count for user
   */
  async getUserSessionCount(userId: string): Promise<number> {
    return this.redis.scard(this.getUserSessionsKey(userId));
  }

  /**
   * Get active session count for tenant
   */
  async getTenantSessionCount(tenantId: string): Promise<number> {
    return this.redis.scard(this.getTenantSessionsKey(tenantId));
  }

  /**
   * Validate session and return data
   */
  async validateSession(sessionId: string): Promise<SessionData | null> {
    const sessionData = await this.getSession(sessionId);

    if (!sessionData) {
      return null;
    }

    // Verify not expired
    if (Date.now() > sessionData.expiresAt) {
      await this.destroySession(sessionId);
      return null;
    }

    return sessionData;
  }

  /**
   * Clean up expired sessions (should be run periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    // Get all session keys
    const keys = await this.redis.keys(`${this.prefix}*`);
    let cleanedCount = 0;

    for (const key of keys) {
      if (key.includes(':sessions')) continue; // Skip index keys

      const data = await this.redis.get(key);
      if (!data) continue;

      try {
        const sessionData: SessionData = JSON.parse(data);
        
        if (Date.now() > sessionData.expiresAt) {
          const sessionId = key.replace(this.prefix, '');
          await this.destroySession(sessionId);
          cleanedCount++;
        }
      } catch (error) {
        console.error('Error parsing session data:', error);
        await this.redis.del(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get session statistics
   */
  async getStatistics(): Promise<{
    totalSessions: number;
    totalUsers: number;
    totalTenants: number;
  }> {
    const sessionKeys = await this.redis.keys(`${this.prefix}[!user|tenant]*`);
    const userKeys = await this.redis.keys(`${this.prefix}user:*:sessions`);
    const tenantKeys = await this.redis.keys(`${this.prefix}tenant:*:sessions`);

    return {
      totalSessions: sessionKeys.length,
      totalUsers: userKeys.length,
      totalTenants: tenantKeys.length
    };
  }
}

export default SessionManager;

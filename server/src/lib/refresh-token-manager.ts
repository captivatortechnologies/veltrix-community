/**
 * Refresh Token Manager
 * 
 * Implements JWT refresh token rotation with secure storage.
 * Prevents token replay attacks and supports token revocation.
 */

import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

interface RefreshTokenPayload {
  userId: string;
  tenantId: string;
  tokenFamily: string;
  version: number;
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  tokenFamily: string;
  version: number;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class RefreshTokenManager {
  private redis: Redis;
  private jwtSecret: string;
  private accessTokenTTL: number = 28800; // 8 hours
  private refreshTokenTTL: number = 2592000; // 30 days
  private prefix: string = 'refresh:';

  constructor(redis: Redis, jwtSecret: string) {
    this.redis = redis;
    this.jwtSecret = jwtSecret;
  }

  /**
   * Generate token family ID (for rotation detection)
   */
  private generateTokenFamily(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Get Redis key for refresh token
   */
  private getTokenKey(tokenId: string): string {
    return `${this.prefix}token:${tokenId}`;
  }

  /**
   * Get Redis key for user's refresh tokens
   */
  private getUserTokensKey(userId: string): string {
    return `${this.prefix}user:${userId}:tokens`;
  }

  /**
   * Get Redis key for token family
   */
  private getFamilyKey(tokenFamily: string): string {
    return `${this.prefix}family:${tokenFamily}`;
  }

  /**
   * Generate access token (JWT)
   */
  private generateAccessToken(userId: string, tenantId: string, role: string, permissions: string[]): string {
    return jwt.sign(
      {
        userId,
        tenantId,
        role,
        permissions,
        type: 'access'
      },
      this.jwtSecret,
      {
        expiresIn: this.accessTokenTTL
      }
    );
  }

  /**
   * Generate refresh token (JWT with Redis backing)
   */
  private async generateRefreshToken(
    userId: string,
    tenantId: string,
    tokenFamily?: string,
    version: number = 1
  ): Promise<string> {
    const family = tokenFamily || this.generateTokenFamily();
    const tokenId = randomBytes(32).toString('hex');

    const payload: RefreshTokenPayload = {
      userId,
      tenantId,
      tokenFamily: family,
      version
    };

    const refreshToken = jwt.sign(payload, this.jwtSecret, {
      jwtid: tokenId,
      expiresIn: this.refreshTokenTTL
    });

    // Store token data in Redis
    const tokenData: RefreshTokenData = {
      userId,
      tenantId,
      tokenFamily: family,
      version,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.refreshTokenTTL * 1000
    };

    const pipeline = this.redis.pipeline();

    // Store token data
    pipeline.setex(
      this.getTokenKey(tokenId),
      this.refreshTokenTTL,
      JSON.stringify(tokenData)
    );

    // Add to user tokens index
    pipeline.sadd(this.getUserTokensKey(userId), tokenId);
    pipeline.expire(this.getUserTokensKey(userId), this.refreshTokenTTL);

    // Track token family version
    pipeline.set(this.getFamilyKey(family), version.toString(), 'EX', this.refreshTokenTTL);

    await pipeline.exec();

    return refreshToken;
  }

  /**
   * Create initial token pair
   */
  async createTokenPair(
    userId: string,
    tenantId: string,
    role: string,
    permissions: string[]
  ): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(userId, tenantId, role, permissions);
    const refreshToken = await this.generateRefreshToken(userId, tenantId);

    return {
      accessToken,
      refreshToken
    };
  }

  /**
   * Rotate refresh token (create new pair)
   */
  async rotateToken(
    oldRefreshToken: string,
    role: string,
    permissions: string[]
  ): Promise<TokenPair | null> {
    try {
      // Verify and decode old refresh token
      const decoded = jwt.verify(oldRefreshToken, this.jwtSecret) as RefreshTokenPayload & { jti: string };
      const tokenId = decoded.jti;

      // Get token data from Redis
      const tokenKey = this.getTokenKey(tokenId);
      const tokenDataStr = await this.redis.get(tokenKey);

      if (!tokenDataStr) {
        // Token not found - possible replay attack
        console.warn('Refresh token not found in Redis:', tokenId);
        await this.revokeTokenFamily(decoded.tokenFamily);
        return null;
      }

      const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);

      // Check if token was already used (rotation detection)
      if (tokenData.lastUsedAt) {
        console.warn('Refresh token reuse detected:', tokenId);
        // Revoke entire token family (all tokens in rotation chain)
        await this.revokeTokenFamily(tokenData.tokenFamily);
        return null;
      }

      // Check version matches current family version
      const currentVersion = await this.redis.get(this.getFamilyKey(tokenData.tokenFamily));
      if (currentVersion && parseInt(currentVersion) !== tokenData.version) {
        console.warn('Token version mismatch:', tokenId);
        await this.revokeTokenFamily(tokenData.tokenFamily);
        return null;
      }

      // Mark token as used
      tokenData.lastUsedAt = Date.now();
      await this.redis.setex(
        tokenKey,
        60, // Keep for 1 minute to detect replay
        JSON.stringify(tokenData)
      );

      // Generate new token pair with incremented version
      const accessToken = this.generateAccessToken(
        tokenData.userId,
        tokenData.tenantId,
        role,
        permissions
      );
      const refreshToken = await this.generateRefreshToken(
        tokenData.userId,
        tokenData.tenantId,
        tokenData.tokenFamily,
        tokenData.version + 1
      );

      return {
        accessToken,
        refreshToken
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.error('Invalid refresh token:', error.message);
      } else {
        console.error('Token rotation error:', error);
      }
      return null;
    }
  }

  /**
   * Revoke specific refresh token
   */
  async revokeToken(refreshToken: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as RefreshTokenPayload & { jti: string };
      const tokenId = decoded.jti;

      const pipeline = this.redis.pipeline();

      // Remove token data
      pipeline.del(this.getTokenKey(tokenId));

      // Remove from user tokens index
      pipeline.srem(this.getUserTokensKey(decoded.userId), tokenId);

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Failed to revoke token:', error);
      return false;
    }
  }

  /**
   * Revoke all tokens in a token family (rotation chain)
   */
  async revokeTokenFamily(tokenFamily: string): Promise<void> {
    // Delete family version tracker
    await this.redis.del(this.getFamilyKey(tokenFamily));

    // Find and delete all tokens in this family
    const pattern = `${this.prefix}token:*`;
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const tokenDataStr = await this.redis.get(key);
      if (!tokenDataStr) continue;

      try {
        const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
        if (tokenData.tokenFamily === tokenFamily) {
          await this.redis.del(key);
          await this.redis.srem(this.getUserTokensKey(tokenData.userId), key.split(':').pop()!);
        }
      } catch (error) {
        console.error('Error processing token during family revocation:', error);
      }
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeUserTokens(userId: string): Promise<number> {
    const tokenIds = await this.redis.smembers(this.getUserTokensKey(userId));

    if (!tokenIds.length) {
      return 0;
    }

    const pipeline = this.redis.pipeline();

    for (const tokenId of tokenIds) {
      pipeline.del(this.getTokenKey(tokenId));
    }

    pipeline.del(this.getUserTokensKey(userId));

    await pipeline.exec();
    return tokenIds.length;
  }

  /**
   * Validate refresh token
   */
  async validateToken(refreshToken: string): Promise<RefreshTokenData | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as RefreshTokenPayload & { jti: string };
      const tokenId = decoded.jti;

      const tokenDataStr = await this.redis.get(this.getTokenKey(tokenId));

      if (!tokenDataStr) {
        return null;
      }

      const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);

      // Check if already used
      if (tokenData.lastUsedAt) {
        return null;
      }

      // Check if expired
      if (Date.now() > tokenData.expiresAt) {
        return null;
      }

      return tokenData;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const pattern = `${this.prefix}token:*`;
    const keys = await this.redis.keys(pattern);
    let cleanedCount = 0;

    for (const key of keys) {
      const tokenDataStr = await this.redis.get(key);
      if (!tokenDataStr) {
        await this.redis.del(key);
        cleanedCount++;
        continue;
      }

      try {
        const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);

        if (Date.now() > tokenData.expiresAt) {
          await this.redis.del(key);
          await this.redis.srem(this.getUserTokensKey(tokenData.userId), key.split(':').pop()!);
          cleanedCount++;
        }
      } catch (error) {
        console.error('Error cleaning up token:', error);
        await this.redis.del(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get user's active tokens count
   */
  async getUserTokenCount(userId: string): Promise<number> {
    return this.redis.scard(this.getUserTokensKey(userId));
  }
}

export default RefreshTokenManager;

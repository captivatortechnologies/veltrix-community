import prisma from '../../db';
import * as bcrypt from 'bcrypt';
import { sign, verify } from 'jsonwebtoken';
import { config } from '../../config';
import { loggerService } from '../../module/logger/logger.service';
import { resolvePermissionSnapshotForUser, buildPermissionSnapshot } from '../../lib/permissions';
import crypto from 'crypto';
import {
  LoginRequestType,
  RegisterRequestType,
  ChangePasswordRequestType,
  UserResponseType,
  LoginResponseType,
  LoginResultType,
  JwtPayloadType,
  RefreshTokenPayloadType,
  RefreshTokenResponseType
} from './auth.schema';

// Define token configuration
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '8h'; // Access token (default 8 hours)
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d'; // Refresh token (default 30 days)
// Impersonation tokens are deliberately short-lived and are NEVER paired with
// a refresh token — expiry is the hard bound on an impersonated session.
const IMPERSONATION_TOKEN_EXPIRY = '15m';
export const IMPERSONATION_TOKEN_EXPIRY_SECONDS = 15 * 60;

// SECURITY: fail-fast, no public fallback. A hardcoded default secret would
// let anyone forge a valid session token against any install that forgets
// to configure one. `config.jwtSecret` / `config.jwt.refreshSecret` (from
// JWT_SECRET / JWT_REFRESH_SECRET) are guaranteed non-empty by the time this
// module runs — `config/env.ts` fails fast (exits the process) at import
// time if either is unset, so no local fallback literal or re-check is
// needed here; a dedicated Jest setup file supplies deterministic test-only
// values so unit tests never depend on a real .env file.
const JWT_SECRET = config.jwtSecret;
const REFRESH_SECRET = config.jwt.refreshSecret;

// Helper function to ensure a string is returned
function ensureString(value: string | null | undefined, defaultValue: string = 'Unknown'): string {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

/**
 * Helper to convert JWT time notation to seconds for client
 */
function getExpirySeconds(timeString: string): number {
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60
  };

  const match = timeString.match(/^(\d+)([smhd])$/);
  if (match) {
    const [_, value, unit] = match;
    return parseInt(value) * (units[unit] || 1);
  }

  // Default to 3600 seconds (1 hour) if format isn't recognized
  return 3600;
}

export const authService = {
  // Check if user exists
  async checkUser(email: string): Promise<{ id: string; authProvider?: string } | null> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        authProvider: true
      }
    });

    if (user) {
      return {
        id: user.id,
        authProvider: user.authProvider || undefined
      };
    }

    // If user doesn't exist in database, check Cognito.
    // Credentials may come from the encrypted IdP config (saved in the UI) or
    // from env — resolveAwsCredentials/hasAwsCredentialsConfigured handles both,
    // so a UI-configured Cognito works without a restart or env vars.
    {
      try {
        // Import the cognitoService
        const { cognitoService } = await import('../cognito/cognito.service');

        if (!(await cognitoService.hasAwsCredentialsConfigured())) {
          loggerService.info('Skipping Cognito check - AWS credentials not configured');
          return null;
        }

        // Get Cognito configuration
        const cognitoConfig = await cognitoService.getCognitoConfig();

        // Only proceed if Cognito is enabled and properly configured
        if (cognitoConfig && cognitoConfig.enabled && cognitoConfig.userPoolId) {
          try {
            loggerService.info(`Checking if user exists locally and in Cognito: ${email}`);
            // Check if user exists in Cognito
            const userExistsInCognito = await cognitoService.checkUserExistsInCognito(email);

            if (userExistsInCognito) {
              // User exists in Cognito but not in database
              loggerService.info(`User ${email} found in Cognito`);
              return {
                id: 'cognito-user',
                authProvider: 'COGNITO'
              };
            }
            loggerService.info(`User ${email} not found in Cognito`);
          } catch (cognitoError) {
            // Log the error but don't propagate it - just treat as user not found
            loggerService.error(`Error checking user ${email} in Cognito (will treat as not found):`, cognitoError);
            // Don't throw - just continue to return null
          }
        } else {
          loggerService.warn('Cognito is not properly configured or is disabled');
        }
      } catch (error) {
        loggerService.error('Error loading Cognito service (will treat user as not found):', error);
        // Don't throw - just continue to return null
      }
    }

    return null;
  },

  // Generate JWT access token
  generateAccessToken(userId: string, customerId: string, roleId: string): string {
    loggerService.debug(`Generating access token for user: ${userId}`);
    return sign(
      { userId, customerId, roleId },
      JWT_SECRET as any,
      { expiresIn: ACCESS_TOKEN_EXPIRY } as any
    );
  },

  /**
   * Generate a short-lived impersonation access token for `targetUserId`.
   *
   * The payload is a superset of the normal access-token payload, so every
   * existing verify/decode path treats the bearer as the target user
   * transparently. The extra claims exist so that:
   *  - `ensurePlatformAdmin` can refuse portal access to impersonated
   *    sessions (no nested impersonation, no privilege re-entry), and
   *  - audit trails can attribute actions to the real operator.
   *
   * No refresh token is ever issued for impersonation — the 15 minute expiry
   * is the hard bound of the session.
   */
  generateImpersonationToken(
    targetUserId: string,
    customerId: string,
    roleId: string,
    impersonatorUserId: string
  ): string {
    loggerService.info(
      `Generating impersonation token for user ${targetUserId} (impersonator: ${impersonatorUserId})`
    );
    return sign(
      {
        userId: targetUserId,
        customerId,
        roleId,
        impersonatorUserId,
        impersonation: true,
      },
      JWT_SECRET as any,
      { expiresIn: IMPERSONATION_TOKEN_EXPIRY } as any
    );
  },

  // Generate refresh token
  generateRefreshToken(userId: string, email: string): string {
    loggerService.debug(`Generating refresh token for user: ${userId}`);
    // Add a random session identifier to allow selective token revocation
    const sessionId = crypto.randomBytes(16).toString('hex');

    const payload = { userId, email, sessionId };

    return sign(
      payload,
      REFRESH_SECRET as any,
      { expiresIn: REFRESH_TOKEN_EXPIRY } as any
    );
  },

  // Generate token pair (access + refresh)
  generateTokens(userId: string, email: string, customerId: string, roleId: string) {
    return {
      access_token: this.generateAccessToken(userId, customerId, roleId),
      refresh_token: this.generateRefreshToken(userId, email),
      token_type: 'Bearer',
      expires_in: getExpirySeconds(ACCESS_TOKEN_EXPIRY),
      refresh_expires_in: getExpirySeconds(REFRESH_TOKEN_EXPIRY)
    };
  },

  // Verify access token
  verifyAccessToken(token: string): JwtPayloadType | null {
    try {
      return verify(token, JWT_SECRET as any) as JwtPayloadType;
    } catch (error) {
      return null;
    }
  },

  // Verify refresh token
  verifyRefreshToken(token: string): RefreshTokenPayloadType | null {
    try {
      return verify(token, REFRESH_SECRET as any) as RefreshTokenPayloadType;
    } catch (error) {
      return null;
    }
  },

  /**
   * Stamp User.lastLoginAt for a login that actually issued tokens.
   * Called from the direct (non-2FA) login path and from the 2FA completion
   * path — NOT when a 2FA challenge is returned, since no session exists yet.
   * Awaited but non-fatal: a failed stamp must never block a valid login.
   */
  async recordSuccessfulLogin(userId: string): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    } catch (error) {
      loggerService.error(`Failed to record lastLoginAt for user ${userId}:`, error);
    }
  },

  // Login user
  async login(data: LoginRequestType): Promise<LoginResultType | null> {
    // Find user by email with password and role
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        role: true,
        // Relation field name is unchanged by the Customer -> Organization
        // model rename (only the relation's target TYPE changed) — see the
        // rename note at the top of schema.prisma.
        customer: true,
        password: true,
        settings: true
      }
    });

    // If user exists in database with LOCAL auth provider
    if (user && user.authProvider === 'LOCAL' && user.password) {
      // Check if password matches
      const passwordMatches = await bcrypt.compare(data.password, user.password.password);
      if (!passwordMatches) {
        return null;
      }

      // Check if the user account itself has been deactivated by an admin.
      if (!user.isActive) {
        return null;
      }

      // Check if the organization is active.
      if (!user.customer.isActive) {
        return null;
      }

      // TOTP 2FA: when enabled (with a verified secret on record), do NOT
      // issue tokens — return a short-lived challenge instead. The client
      // exchanges it (plus a valid code) at POST /auth/2fa/login. Users
      // without 2FA follow the exact token path below, unchanged.
      // Dynamic import mirrors the cognito pattern and avoids a module cycle
      // (two-factor.service imports authService for token generation).
      if (user.settings?.twoFactorEnabled && user.settings.twoFactorSecret) {
        const { twoFactorService } = await import('./two-factor.service');
        loggerService.info(`Login requires 2FA for user: ${user.id}`);
        return {
          requires2fa: true,
          challengeToken: twoFactorService.createChallengeToken(user.id)
        };
      }

      // Generate tokens
      const tokens = this.generateTokens(
        user.id,
        user.email,
        user.customerId,
        user.roleId
      );

      // Tokens are being issued — this is the moment the login succeeded.
      await this.recordSuccessfulLogin(user.id);

      // Resolved permission snapshot: fetched once at login so the client
      // never has to trust a role name for gating.
      const permissions = await resolvePermissionSnapshotForUser(user.id);

      // Return user info and tokens
      return {
        user: {
          id: user.id,
          email: user.email,
          name: String(user.name || ''),
          role: String(user.role?.name || 'Unknown'),
          customerId: user.customerId
        },
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_expires_in: tokens.refresh_expires_in,
        permissions
      };
    }

    // If user doesn't exist in database or is not a LOCAL user, try Cognito.
    // Credentials resolve from the encrypted IdP config first, then env (see
    // cognitoService.resolveAwsCredentials) — UI-configured Cognito needs no restart.
    {
      try {
        // Import the cognitoService
        const { cognitoService } = await import('../cognito/cognito.service');

        if (!(await cognitoService.hasAwsCredentialsConfigured())) {
          loggerService.info('Skipping Cognito login fallback - AWS credentials not configured');
          return null;
        }

        // Get Cognito configuration
        const cognitoConfig = await cognitoService.getCognitoConfig();

        // Only proceed if Cognito is enabled and properly configured
        if (cognitoConfig && cognitoConfig.enabled && cognitoConfig.userPoolId) {
          try {
            // Check if user exists in Cognito
            const userExistsInCognito = await cognitoService.checkUserExistsInCognito(data.email);

            if (userExistsInCognito) {
              // User exists in Cognito but we can't authenticate with password here
              // Return a special response that indicates the client should use Cognito.
              // No real session is issued here (token is the sentinel value
              // below, not a JWT) and no user/organization row has been
              // resolved yet (that happens in exchangeCognitoTokens once the
              // Hosted UI flow completes), so customerId is intentionally
              // empty rather than a placeholder tenant id, and the
              // permission snapshot is empty rather than resolved against a
              // real role.
              return {
                user: {
                  id: 'cognito-user',
                  email: data.email,
                  name: 'Cognito User',
                  role: 'User',
                  customerId: '',
                  authProvider: 'COGNITO'
                },
                permissions: buildPermissionSnapshot([]),
                token: 'REDIRECT_TO_COGNITO'
              };
            }
          } catch (cognitoError) {
            // Log and propagate the error for better debugging
            loggerService.error(`Error checking user ${data.email} in Cognito during login:`, cognitoError);
            throw new Error(`Cognito login error: ${cognitoError instanceof Error ? cognitoError.message : 'Unknown error'}`);
          }
        } else {
          loggerService.warn('Cognito is not properly configured or is disabled');
        }
      } catch (error) {
        loggerService.error('Error checking Cognito during login:', error);
        // Propagate the error for better response in the controller
        throw error;
      }
    }

    return null;
  },

  // Register new user
  async register(data: RegisterRequestType): Promise<LoginResponseType | null> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      return null;
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: data.customerId }
    });

    if (!organization) {
      return null;
    }

    // If no role specified, use default 'Administrator' role
    let finalRoleId = data.roleId;
    if (!finalRoleId) {
      const defaultRole = await prisma.role.findFirst({
        where: {
          name: 'Administrator',
          customerId: data.customerId
        }
      });

      if (!defaultRole) {
        return null;
      }

      finalRoleId = defaultRole.id;
    } else {
      // Verify that the role exists and belongs to the customer
      const role = await prisma.role.findFirst({
        where: {
          id: finalRoleId,
          customerId: data.customerId
        }
      });

      if (!role) {
        return null;
      }
    }

    // Set auth provider (default to LOCAL if not specified)
    const authProvider = data.authProvider || 'LOCAL';

    // Create user data object
    const userData: any = {
      email: data.email,
      name: data.name,
      customerId: data.customerId,
      roleId: finalRoleId,
      authProvider: authProvider
    };

    // Only create password for LOCAL auth provider
    if (authProvider === 'LOCAL') {
      // Hash the password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Add password to user data
      userData.password = {
        create: {
          password: hashedPassword
        }
      };
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: userData,
      include: {
        role: true
      }
    });

    // Generate tokens with refresh token
    const tokens = this.generateTokens(
      newUser.id,
      newUser.email,
      newUser.customerId,
      newUser.roleId
    );

    const permissions = await resolvePermissionSnapshotForUser(newUser.id);

    // Return user info and tokens
    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        name: String(newUser.name || ''),
        role: String(newUser.role?.name || 'Unknown'),
        customerId: newUser.customerId
      },
      token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      refresh_expires_in: tokens.refresh_expires_in,
      permissions
    };
  },

  // Get current user info
  async getCurrentUser(token: string): Promise<UserResponseType | null> {
    try {
      // Verify token
      const decoded = this.verifyAccessToken(token);
      if (!decoded) {
        return null;
      }

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          role: true,
          customer: true
        }
      });

      if (!user) {
        return null;
      }

      // Check if the organization is active
      if (!user.customer.isActive) {
        return null;
      }

      // Return user info
      return {
        id: user.id,
        email: user.email,
        name: String(user.name || ''),
        role: String(user.role?.name || 'Unknown'),
        customerId: user.customerId
      };
    } catch (error) {
      return null;
    }
  },

  // Change password
  async changePassword(userId: string, data: ChangePasswordRequestType): Promise<boolean> {
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { password: true }
    });

    if (!user || !user.password) {
      return false;
    }

    // Check current password
    const passwordMatches = await bcrypt.compare(data.currentPassword, user.password.password);
    if (!passwordMatches) {
      return false;
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(data.newPassword, 10);

    // Update password
    await prisma.userPassword.update({
      where: { userId },
      data: { password: hashedNewPassword }
    });

    return true;
  },

  // Refresh access token using a valid refresh token
  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponseType | null> {
    loggerService.info(`Token refresh attempt initiated`);

    // Verify the refresh token
    loggerService.debug(`Verifying refresh token`);
    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      loggerService.warn(`Token refresh failed - invalid refresh token`);
      return null;
    }

    // Extract user info from refresh token
    const { userId, email, sessionId } = decoded;
    loggerService.debug(`Extracted data from refresh token`, { userId, email, sessionId });

    if (!userId || !email) {
      loggerService.warn(`Token refresh failed - invalid token payload`);
      return null;
    }

    // Get the user to ensure they still exist and to fetch their organization and role
    loggerService.debug(`Verifying user still exists`, { userId, email });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: true
      }
    });

    if (!user) {
      loggerService.warn(`Token refresh failed - user not found`, { userId, email });
      return null;
    }

    // Check if the organization is active
    if (!user.customer.isActive) {
      loggerService.warn(`Token refresh failed - organization is inactive`, { userId, customerId: user.customerId });
      return null;
    }

    // Generate new access token only (keep original refresh token)
    const accessToken = this.generateAccessToken(
      user.id,
      user.customerId,
      user.roleId
    );

    loggerService.info(`Token refresh completed successfully`, { userId, email });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: getExpirySeconds(ACCESS_TOKEN_EXPIRY)
    };
  }
};

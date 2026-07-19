import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import { twoFactorService, TwoFactorError } from './two-factor.service';
import {
  LoginRequestType,
  RegisterRequestType,
  ChangePasswordRequestType,
  CheckUserRequestType,
  RefreshTokenRequestType,
  isTwoFactorChallenge
} from './auth.schema';
import { loggerService } from '../../module/logger/logger.service';
import { createUserSession, recordAuditEvent } from '../../lib/audit-event';

/**
 * Record a UserSession + a "login" AuditEvent for a successful authentication.
 * Best-effort: helpers swallow their own errors so this never breaks login.
 */
async function recordLoginSession(
  request: FastifyRequest,
  user: { id?: string; customerId?: string; name?: string; email?: string },
): Promise<void> {
  if (!user?.id || !user?.customerId) return;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] as string | undefined;
  const sessionId = await createUserSession({ userId: user.id, customerId: user.customerId, ipAddress, userAgent });
  await recordAuditEvent({
    customerId: user.customerId,
    userId: user.id,
    actorName: user.name || user.email,
    action: 'login',
    resourceType: 'session',
    resourceId: sessionId,
    status: 'success',
    ipAddress,
    userAgent,
  });
}

export const authController = {
  // Check if user exists
  checkUser: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as CheckUserRequestType;

      loggerService.info(`Checking if user exists: ${data.email}`);

      try {
        const user = await authService.checkUser(data.email);

        if (!user) {
          loggerService.info(`User not found: ${data.email}`);
          return reply.status(404).send({
            exists: false,
            message: `User ${data.email} not found in local database or Cognito`
          });
        }

        loggerService.info(`User found: ${data.email}, auth provider: ${user.authProvider || 'LOCAL'}`);
        reply.send({
          exists: true,
          authProvider: user.authProvider || 'LOCAL'
        });
      } catch (checkError) {
        loggerService.error(`Specific error checking user ${data.email}:`, checkError);
        // Return success: false with detailed error message
        return reply.status(500).send({
          error: 'Error checking user',
          details: checkError instanceof Error ? checkError.message : 'Unknown error',
          exists: false
        });
      }
    } catch (error) {
      loggerService.error('Error in check user controller:', error);
      reply.status(500).send({
        error: 'Error checking user',
        details: error instanceof Error ? error.message : 'Unknown error',
        exists: false
      });
    }
  },

  // Login user
  login: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as LoginRequestType;

      loggerService.info(`Login attempt for email: ${data.email}`);

      try {
        const result = await authService.login(data);

        if (!result) {
          loggerService.warn(`Login failed for email: ${data.email}`);
          return reply.status(401).send({
            error: 'Invalid email or password',
            message: 'Authentication failed. The email or password provided is incorrect.'
          });
        }

        // TOTP step required — return the challenge (never tokens) and let
        // the client complete the login at POST /auth/2fa/login.
        if (isTwoFactorChallenge(result)) {
          loggerService.info(`Login requires 2FA for email: ${data.email}`);
          return reply.send(result);
        }

        if (result.token === 'REDIRECT_TO_COGNITO') {
          loggerService.info(`Redirecting to Cognito for user: ${data.email}`);
        } else {
          loggerService.info(`Login successful for user: ${result.user.id}`);
          await recordLoginSession(request, result.user);
        }

        reply.send(result);
      } catch (loginError) {
        loggerService.error(`Specific error during login for user ${data.email}:`, loginError);
        return reply.status(500).send({
          error: 'Error during login',
          details: loginError instanceof Error ? loginError.message : 'Unknown login error'
        });
      }
    } catch (error) {
      loggerService.error('Error in login controller:', error);
      reply.status(500).send({
        error: 'Error during login',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Register new user
  register: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as RegisterRequestType;

      loggerService.info(`Registration attempt for email: ${data.email}`);

      try {
        const result = await authService.register(data);

        if (!result) {
          loggerService.warn(`Registration failed for email: ${data.email} - user may already exist or invalid data`);
          return reply.status(400).send({ 
            error: 'Unable to register user',
            message: 'User may already exist or the provided data is invalid'
          });
        }

        loggerService.info(`User registered successfully: ${result.user.id}`);
        reply.status(201).send(result);
      } catch (registerError) {
        loggerService.error(`Specific error during registration for ${data.email}:`, registerError);
        return reply.status(500).send({
          error: 'Error during registration',
          details: registerError instanceof Error ? registerError.message : 'Unknown registration error'
        });
      }
    } catch (error) {
      loggerService.error('Error in registration controller:', error);
      reply.status(500).send({
        error: 'Error during registration',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get current user info
  getCurrentUser: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.split(' ')[1];

      if (!token) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const user = await authService.getCurrentUser(token);

      if (!user) {
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }

      reply.send({ user });
    } catch (error) {
      loggerService.error('Error getting current user:', error);
      reply.status(500).send({ error: 'Error getting current user' });
    }
  },

  // Change password
  changePassword: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as ChangePasswordRequestType;
      const token = request.headers.authorization?.split(' ')[1];

      if (!token) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const user = await authService.getCurrentUser(token);

      if (!user) {
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }

      const success = await authService.changePassword(user.id, data);

      if (!success) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      loggerService.info(`Password changed successfully for user: ${user.id}`);
      reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      loggerService.error('Error changing password:', error);
      reply.status(500).send({ error: 'Error changing password' });
    }
  },

  // Begin a self-service password reset. ALWAYS returns the same 200 response
  // regardless of whether the account exists / is eligible — this endpoint must
  // never reveal which emails are registered.
  forgotPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    const { email } = request.body as { email: string };
    try {
      await authService.requestPasswordReset(email);
    } catch (error) {
      // Log but do not surface — the response is uniform on purpose.
      loggerService.error('Error handling forgot-password request:', error);
    }
    return reply.send({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  },

  // Complete a password reset with the token from the emailed link.
  resetPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, newPassword } = request.body as { token: string; newPassword: string };
      const ok = await authService.resetPassword(token, newPassword);
      if (!ok) {
        return reply.status(400).send({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      }
      return reply.send({ message: 'Your password has been reset. You can now sign in with your new password.' });
    } catch (error) {
      loggerService.error('Error resetting password:', error);
      return reply.status(500).send({ error: 'Error resetting password' });
    }
  },

  // ===== TOTP 2FA (P6) =====

  // Begin 2FA setup (authenticated): returns the secret + otpauth URI,
  // pending until a code is verified.
  setup2fa: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const result = await twoFactorService.setup(userId);
      reply.send(result);
    } catch (error) {
      if (error instanceof TwoFactorError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      loggerService.error('Error in 2FA setup:', error);
      reply.status(500).send({ error: 'Error starting two-factor setup' });
    }
  },

  // Verify a TOTP code against the pending secret and enable 2FA.
  verify2fa: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { code } = request.body as { code: string };
      const result = await twoFactorService.verifyAndEnable(userId, code);
      reply.send(result);
    } catch (error) {
      if (error instanceof TwoFactorError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      loggerService.error('Error in 2FA verify:', error);
      reply.status(500).send({ error: 'Error verifying two-factor code' });
    }
  },

  // Disable 2FA (requires a valid TOTP code against the active secret).
  disable2fa: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { code } = request.body as { code: string };
      const result = await twoFactorService.disable(userId, code);
      reply.send(result);
    } catch (error) {
      if (error instanceof TwoFactorError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      loggerService.error('Error in 2FA disable:', error);
      reply.status(500).send({ error: 'Error disabling two-factor authentication' });
    }
  },

  // Complete a 2FA login: challenge token + valid code -> full token pair.
  twoFactorLogin: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { challengeToken, code } = request.body as {
        challengeToken: string;
        code: string;
      };

      const result = await twoFactorService.completeLogin(challengeToken, code);
      loggerService.info(`2FA login successful for user: ${result.user.id}`);
      await recordLoginSession(request, result.user);
      reply.send(result);
    } catch (error) {
      if (error instanceof TwoFactorError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      loggerService.error('Error in 2FA login:', error);
      reply.status(500).send({ error: 'Error completing two-factor login' });
    }
  },

  // Refresh access token
  refreshToken: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as RefreshTokenRequestType;
      
      loggerService.info(`Token refresh attempt initiated`);

      try {
        const result = await authService.refreshAccessToken(data.refresh_token);

        if (!result) {
          loggerService.warn(`Token refresh failed - invalid refresh token`);
          return reply.status(401).send({
            error: 'Invalid refresh token',
            message: 'The provided refresh token is invalid or expired.'
          });
        }

        loggerService.info(`Token refresh successful`);
        reply.send(result);
      } catch (refreshError) {
        loggerService.error(`Specific error during token refresh:`, refreshError);
        return reply.status(500).send({
          error: 'Error during token refresh',
          details: refreshError instanceof Error ? refreshError.message : 'Unknown error'
        });
      }
    } catch (error) {
      loggerService.error('Error in refresh token controller:', error);
      reply.status(500).send({
        error: 'Error during token refresh',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

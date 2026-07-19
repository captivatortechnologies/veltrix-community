import prisma from '../db';
import { loggerService } from '../module/logger/logger.service';

/**
 * Tenant-scoped audit + session helpers.
 *
 * These back the tenant-facing Reports section (Audit Logs + User Activity).
 * All writes are best-effort: a failure here must never break the calling
 * request (login, a mutation, etc.), so every function swallows its own errors.
 */

export interface AuditEventInput {
  customerId: string;
  userId?: string | null;
  actorName?: string | null;
  action: string; // "login" | "logout" | "create" | "update" | "delete" | "deploy" | ...
  resourceType: string; // "user" | "credential" | "component" | "app" | "session" | ...
  resourceId?: string | null;
  resourceName?: string | null;
  status?: 'success' | 'failure' | 'warning';
  ipAddress?: string | null;
  userAgent?: string | null;
  location?: string | null;
  details?: unknown;
}

/**
 * Record a single tenant audit event. Best-effort; never throws.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        customerId: input.customerId,
        userId: input.userId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        resourceName: input.resourceName ?? null,
        status: input.status ?? 'success',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        location: input.location ?? null,
        details:
          input.details === undefined || input.details === null
            ? undefined
            : (input.details as object),
      },
    });
  } catch (error) {
    loggerService.warn('recordAuditEvent failed (non-fatal):', error);
  }
}

/**
 * Derive a coarse "Browser on OS" device label from a User-Agent string, with
 * no external dependency. Falls back to "Unknown device".
 */
export function deviceFromUserAgent(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  // Order matters: iPhone/iPad UAs contain "like Mac OS X", and Android UAs
  // contain "Linux" — so match the mobile platforms before the desktop ones.
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

export interface CreateSessionInput {
  userId: string;
  customerId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  location?: string | null;
  expiresAt?: Date | null;
}

/**
 * Open a session row for a successful login. Best-effort; returns the created
 * session id (or null on failure) so callers can correlate a later logout.
 */
export async function createUserSession(input: CreateSessionInput): Promise<string | null> {
  try {
    const session = await prisma.userSession.create({
      data: {
        userId: input.userId,
        customerId: input.customerId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        device: deviceFromUserAgent(input.userAgent),
        location: input.location ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      select: { id: true },
    });
    return session.id;
  } catch (error) {
    loggerService.warn('createUserSession failed (non-fatal):', error);
    return null;
  }
}

/**
 * Mark a user's currently-active sessions as revoked (logout / revoke-all).
 * If sessionId is provided, revoke only that one. Best-effort; never throws.
 */
export async function revokeUserSessions(
  userId: string,
  sessionId?: string | null,
): Promise<void> {
  try {
    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(sessionId ? { id: sessionId } : {}),
      },
      data: { revokedAt: new Date() },
    });
  } catch (error) {
    loggerService.warn('revokeUserSessions failed (non-fatal):', error);
  }
}

// ========================================================================
// User Service
//
// Tenant-scoped user CRUD. EVERY query here is scoped by the caller's own
// customerId — there is no code path in this module that can read, create,
// update, or delete a user in a different tenant. Cross-tenant user
// management is a deliberately separate, admin-gated surface:
// module/platform-admin/user-management/.
//
// Extracted from the (formerly unauthenticated, cross-tenant) inline routes
// in server.ts — business logic below is preserved as-is; only the tenancy
// boundary and auth are new.
// ========================================================================

import * as bcrypt from 'bcrypt'
import prisma from '../../db'
import { loggerService } from '../logger/logger.service'
import type { CreateUserRequest, UpdateUserRequest, UserSummary } from './user.schemas'

const BCRYPT_SALT_ROUNDS = 10

export class UserServiceError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'UserServiceError'
    this.statusCode = statusCode
  }
}

/** Maps a Prisma User row (with `role` included) to the wire response shape. */
function toSummary(user: { id: string; name: string | null; firstName: string | null; lastName: string | null; phoneNumber: string | null; email: string; customerId: string; authProvider: string | null; role?: { name: string } | null }): UserSummary {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    role: user.role?.name || 'Unknown',
    customerId: user.customerId,
    authProvider: user.authProvider || 'LOCAL',
  }
}

/** Resolve a role for `roleId` within `customerId`, falling back to the tenant's default 'User' role. */
async function resolveTenantRole(roleId: string | undefined, customerId: string) {
  if (roleId) {
    const role = await prisma.role.findFirst({ where: { id: roleId, customerId } })
    if (role) return role
  }

  const defaultRole = await prisma.role.findFirst({ where: { name: 'User', customerId } })
  if (defaultRole) return defaultRole

  return prisma.role.create({
    data: { name: 'User', description: 'Default user role', customerId },
  })
}

export const userService = {
  /** List users in `customerId`, optionally filtered by authProvider. */
  async listUsers(customerId: string, authProvider?: string): Promise<UserSummary[]> {
    const users = await prisma.user.findMany({
      where: {
        customerId,
        ...(authProvider ? { authProvider } : {}),
      },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    })

    return users.map(toSummary)
  },

  /** Create a LOCAL or COGNITO user within `customerId` (never any other tenant). */
  async createUser(customerId: string, data: CreateUserRequest): Promise<UserSummary> {
    const { name, email, password, authProvider = 'LOCAL' } = data

    const role = await resolveTenantRole(data.roleId, customerId)

    const existingUserInDb = await prisma.user.findUnique({ where: { email } })
    if (existingUserInDb) {
      throw new UserServiceError('A user with this email already exists', 400)
    }

    const { cognitoService } = await import('../cognito/cognito.service')

    const userExistsInCognito = await cognitoService.checkUserExistsInCognito(email, customerId)
    if (userExistsInCognito) {
      throw new UserServiceError('A user with this email already exists in Cognito', 400)
    }

    let cognitoUserId: string | null = null
    if (authProvider === 'COGNITO') {
      const cognitoResult = await cognitoService.createUserInCognito({
        email,
        name,
        password,
        roleId: role.id,
        customerId,
      })

      if (!cognitoResult.success) {
        throw new UserServiceError(cognitoResult.error || 'Failed to create user in Cognito', 500)
      }
      cognitoUserId = cognitoResult.cognitoUserId ?? null
      loggerService.info(`Created user in Cognito with ID: ${cognitoUserId}`)
    }

    let userData: Parameters<typeof prisma.user.create>[0]['data']

    if (authProvider === 'LOCAL') {
      if (!password) {
        throw new UserServiceError('Password is required for LOCAL users', 400)
      }
      userData = {
        email,
        name,
        customerId,
        roleId: role.id,
        authProvider,
        password: { create: { password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) } },
      }
    } else if (authProvider === 'COGNITO' && cognitoUserId) {
      userData = {
        // The Cognito subject id keeps `email` unique without duplicating
        // data already held in Cognito; the real address is preserved below.
        email: `cognito-${cognitoUserId}@example.com`,
        name: `Cognito User ${cognitoUserId.substring(0, 8)}`,
        customerId,
        roleId: role.id,
        authProvider,
        profile: {
          create: {
            organization: email,
            bio: `Cognito User ID: ${cognitoUserId}`,
          },
        },
      }
    } else {
      throw new UserServiceError('Invalid auth provider or missing Cognito User ID', 400)
    }

    const newUser = await prisma.user.create({ data: userData, include: { role: true } })
    return toSummary(newUser)
  },

  /** Update a user that belongs to `customerId`. Throws 404 if the id isn't in this tenant. */
  async updateUser(customerId: string, userId: string, data: UpdateUserRequest): Promise<UserSummary> {
    const existing = await prisma.user.findFirst({ where: { id: userId, customerId } })
    if (!existing) {
      throw new UserServiceError('User not found', 404)
    }

    let roleId: string | undefined
    if (data.roleId) {
      const role = await prisma.role.findFirst({ where: { id: data.roleId, customerId } })
      if (!role) {
        throw new UserServiceError('Role not found in your organization', 400)
      }
      roleId = role.id
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
        ...(data.email !== undefined && { email: data.email }),
        ...(roleId !== undefined && { roleId }),
      },
      include: { role: true },
    })

    if (data.password) {
      const hashed = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS)
      await prisma.userPassword.upsert({
        where: { userId },
        update: { password: hashed },
        create: { userId, password: hashed },
      })
    }

    return toSummary(updated)
  },

  /** Delete a user that belongs to `customerId`. Throws 404 if the id isn't in this tenant. */
  async deleteUser(customerId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { id: userId, customerId },
      include: { password: true, profile: true },
    })

    if (!user) {
      throw new UserServiceError('User not found', 404)
    }

    if (user.authProvider === 'COGNITO') {
      try {
        const { cognitoService } = await import('../cognito/cognito.service')

        let cognitoUserId: string | null = null
        if (user.profile?.bio) {
          const match = user.profile.bio.match(/Cognito User ID: (.+)/)
          if (match?.[1]) cognitoUserId = match[1]
        }

        if (cognitoUserId) {
          const result = await cognitoService.deleteUserFromCognito(cognitoUserId, user.customerId)
          if (!result.success) {
            loggerService.error('Failed to delete user from Cognito:', result.error)
          }
        } else {
          loggerService.warn('Could not find Cognito User ID for user:', userId)
        }
      } catch (error) {
        loggerService.error('Error deleting user from Cognito:', error)
      }
    }

    if (user.password) {
      await prisma.userPassword.delete({ where: { userId } })
    }

    try {
      await prisma.userProfile.deleteMany({ where: { userId } })
    } catch (error) {
      loggerService.debug('No profile to delete or error deleting profile:', error)
    }

    try {
      await prisma.userSettings.deleteMany({ where: { userId } })
    } catch (error) {
      loggerService.debug('No settings to delete or error deleting settings:', error)
    }

    await prisma.user.delete({ where: { id: userId } })
  },
}

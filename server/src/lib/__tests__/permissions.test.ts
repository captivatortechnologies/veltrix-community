// ========================================================================
// Tests: lib/permissions — the RBAC resolver matrix. Pure-function tests
// for checkPermission/hasAllAllPermission/buildPermissionSnapshot cover
// role x resource x appId x wildcard combinations; DB-touching helpers
// (getRolePermissions, isEffectivelyUnrestrictedAdmin,
// resolvePermissionSnapshotForUser) are covered with prisma mocked.
// ========================================================================

import prisma from '../../db'
import {
  checkPermission,
  hasAllAllPermission,
  buildPermissionSnapshot,
  isEffectivelyUnrestrictedAdmin,
  resolvePermissionSnapshotForUser,
  getRolePermissions,
  type PermissionRow,
} from '../permissions'

jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

const row = (
  resource: string,
  action: string,
  appId: string | null = null,
  roleId = 'role-1',
): PermissionRow => ({ id: `${resource}:${action}:${appId ?? 'platform'}`, resource, action, roleId, appId })

beforeEach(() => jest.clearAllMocks())

// ---------------------------------------------------------------------------
// checkPermission — the full matrix: role x resource x appId x wildcards
// ---------------------------------------------------------------------------

describe('checkPermission', () => {
  it('denies when there are no permissions at all', () => {
    expect(checkPermission([], 'tool', 'read')).toBe(false)
  })

  it('all:all grants every platform check regardless of resource/action', () => {
    const perms = [row('all', 'all')]
    expect(checkPermission(perms, 'tool', 'read')).toBe(true)
    expect(checkPermission(perms, 'role', 'write')).toBe(true)
    expect(checkPermission(perms, 'anything', 'whatever')).toBe(true)
  })

  it('all:all grants every APP-scoped check too', () => {
    const perms = [row('all', 'all')]
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true)
  })

  it('exact platform resource:action match grants a platform check', () => {
    const perms = [row('tool', 'read')]
    expect(checkPermission(perms, 'tool', 'read')).toBe(true)
    expect(checkPermission(perms, 'tool', 'write')).toBe(false)
  })

  it('resource:all grants every action for that resource, platform-scoped', () => {
    const perms = [row('credential', 'all')]
    expect(checkPermission(perms, 'credential', 'read')).toBe(true)
    expect(checkPermission(perms, 'credential', 'write')).toBe(true)
    expect(checkPermission(perms, 'credential', 'delete')).toBe(true)
    expect(checkPermission(perms, 'tool', 'read')).toBe(false)
  })

  it('a platform-scoped row does NOT grant a DIFFERENT resource inside an app', () => {
    const perms = [row('indexes', 'read')] // platform-scoped
    expect(checkPermission(perms, 'roles', 'read', { appId: 'app-1' })).toBe(false)
  })

  it('an app-scoped row grants the exact (resource, action, appId) match', () => {
    const perms = [row('indexes', 'read', 'app-1')]
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true)
  })

  it('an app-scoped row does NOT grant the same resource/action for a DIFFERENT app', () => {
    const perms = [row('indexes', 'read', 'app-1')]
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(false)
  })

  it('an app-scoped row does NOT satisfy a platform-scoped check of the same resource/action', () => {
    const perms = [row('indexes', 'read', 'app-1')]
    expect(checkPermission(perms, 'indexes', 'read')).toBe(false)
  })

  it('design decision 2: a PLATFORM row satisfies an APP-scoped check for the same resource/action (platform wildcard)', () => {
    const perms = [row('indexes', 'read')] // appId = null
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true)
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(true) // any app
  })

  it('design decision 2: a platform resource:all satisfies an app-scoped action check for that resource', () => {
    const perms = [row('indexes', 'all')]
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true)
    expect(checkPermission(perms, 'indexes', 'delete', { appId: 'app-1' })).toBe(true)
  })

  it('app-scoped resource:all grants only within its own app', () => {
    const perms = [row('indexes', 'all', 'app-1')]
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true)
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-2' })).toBe(false)
  })

  it('a resource named literally "all" but scoped to an app is NOT the platform all:all wildcard', () => {
    const perms = [row('all', 'all', 'app-1')]
    expect(checkPermission(perms, 'tool', 'read')).toBe(false)
    // hasAllAllPermission only recognizes appId=null all:all rows.
    expect(hasAllAllPermission(perms)).toBe(false)
  })

  it('combines multiple rows correctly (role holding several grants)', () => {
    const perms = [row('tool', 'read'), row('credential', 'all'), row('indexes', 'read', 'app-1')]
    expect(checkPermission(perms, 'tool', 'read')).toBe(true)
    expect(checkPermission(perms, 'tool', 'write')).toBe(false)
    expect(checkPermission(perms, 'credential', 'delete')).toBe(true)
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true)
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// hasAllAllPermission
// ---------------------------------------------------------------------------

describe('hasAllAllPermission', () => {
  it('true only for a platform-scoped all:all row', () => {
    expect(hasAllAllPermission([row('all', 'all')])).toBe(true)
    expect(hasAllAllPermission([row('all', 'read')])).toBe(false)
    expect(hasAllAllPermission([row('tool', 'all')])).toBe(false)
    expect(hasAllAllPermission([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildPermissionSnapshot
// ---------------------------------------------------------------------------

describe('buildPermissionSnapshot', () => {
  it('reports allAll=true and empty resources when the role holds all:all', () => {
    const snapshot = buildPermissionSnapshot([row('all', 'all')])
    expect(snapshot.wildcards.allAll).toBe(true)
    expect(snapshot.wildcards.resources).toEqual([])
  })

  it('reports allAll=false with zero permission rows', () => {
    const snapshot = buildPermissionSnapshot([])
    expect(snapshot.wildcards.allAll).toBe(false)
    expect(snapshot.permissions).toEqual([])
  })

  it('collects resource:all wildcards, excluding the all:all row itself', () => {
    const snapshot = buildPermissionSnapshot(
      [row('all', 'all'), row('tool', 'all'), row('credential', 'all'), row('tag', 'read')],
    )
    expect(snapshot.wildcards.resources.sort()).toEqual(['credential', 'tool'])
  })

  it('deduplicates repeated resource:all grants (e.g. platform + app-scoped)', () => {
    const snapshot = buildPermissionSnapshot([row('indexes', 'all'), row('indexes', 'all', 'app-1')])
    expect(snapshot.wildcards.resources).toEqual(['indexes'])
  })

  it('maps every row through to the flat permissions list with appId preserved', () => {
    const snapshot = buildPermissionSnapshot([row('indexes', 'read', 'app-1'), row('tool', 'read')])
    expect(snapshot.permissions).toEqual([
      { resource: 'indexes', action: 'read', appId: 'app-1' },
      { resource: 'tool', action: 'read', appId: null },
    ])
  })
})

// ---------------------------------------------------------------------------
// getRolePermissions (raw SQL, appId included)
// ---------------------------------------------------------------------------

describe('getRolePermissions', () => {
  it('selects appId alongside resource/action/roleId', async () => {
    mockQueryRaw.mockResolvedValue([row('tool', 'read', null, 'role-9')])
    const result = await getRolePermissions('role-9')
    expect(result).toEqual([row('tool', 'read', null, 'role-9')])
    expect(mockQueryRaw).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// isEffectivelyUnrestrictedAdmin
// ---------------------------------------------------------------------------

describe('isEffectivelyUnrestrictedAdmin', () => {
  it('true for a role holding all:all', async () => {
    mockQueryRaw.mockResolvedValue([row('all', 'all')])
    expect(await isEffectivelyUnrestrictedAdmin('role-1')).toBe(true)
  })

  it('false for a role with only scoped permissions', async () => {
    mockQueryRaw.mockResolvedValue([row('tool', 'read')])
    expect(await isEffectivelyUnrestrictedAdmin('role-1')).toBe(false)
  })

  it('false for a role with no permission rows at all', async () => {
    mockQueryRaw.mockResolvedValue([])
    expect(await isEffectivelyUnrestrictedAdmin('gone')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolvePermissionSnapshotForUser
// ---------------------------------------------------------------------------

describe('resolvePermissionSnapshotForUser', () => {
  it('resolves an admin user\'s permissions from their role (all:all wildcard)', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'u1',
      roleId: 'role-1',
      role: { name: 'Administrator' },
    })
    mockQueryRaw.mockResolvedValue([row('all', 'all', null, 'role-1')])

    const snapshot = await resolvePermissionSnapshotForUser('u1')
    expect(snapshot.wildcards.allAll).toBe(true)
  })

  it('resolves a regular user\'s permissions from their role', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'u2',
      roleId: 'role-2',
      role: { name: 'User' },
    })
    mockQueryRaw.mockResolvedValue([row('tool', 'read', null, 'role-2')])

    const snapshot = await resolvePermissionSnapshotForUser('u2')
    expect(snapshot.wildcards.allAll).toBe(false)
    expect(snapshot.permissions).toEqual([{ resource: 'tool', action: 'read', appId: null }])
  })

  it('returns an empty snapshot for an unknown user rather than throwing', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const snapshot = await resolvePermissionSnapshotForUser('ghost')
    expect(snapshot).toEqual({ permissions: [], wildcards: { allAll: false, resources: [] } })
  })
})

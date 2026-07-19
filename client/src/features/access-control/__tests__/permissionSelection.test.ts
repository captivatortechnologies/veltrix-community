import { describe, it, expect } from 'vitest';
import {
  permissionKey,
  isPermissionSelected,
  togglePermission,
  hasAllAllSelected,
  setAllAllSelected,
  countForScope,
  formatResourceLabel,
  formatActionLabel,
} from '../permissionSelection';
import type { PermissionInput } from '../../../services/roleService';

describe('permissionKey', () => {
  it('treats null and undefined appId identically', () => {
    expect(permissionKey('tool', 'read', null)).toBe(permissionKey('tool', 'read', undefined));
  });

  it('differs by appId', () => {
    expect(permissionKey('indexes', 'read', 'app-1')).not.toBe(permissionKey('indexes', 'read', 'app-2'));
  });
});

describe('isPermissionSelected / togglePermission', () => {
  it('detects a platform-scoped selection', () => {
    const selected: PermissionInput[] = [{ resource: 'tool', action: 'read', appId: null }];
    expect(isPermissionSelected(selected, 'tool', 'read')).toBe(true);
    expect(isPermissionSelected(selected, 'tool', 'write')).toBe(false);
  });

  it('distinguishes app-scoped grants by appId', () => {
    const selected: PermissionInput[] = [{ resource: 'indexes', action: 'read', appId: 'app-1' }];
    expect(isPermissionSelected(selected, 'indexes', 'read', 'app-1')).toBe(true);
    expect(isPermissionSelected(selected, 'indexes', 'read', 'app-2')).toBe(false);
    expect(isPermissionSelected(selected, 'indexes', 'read')).toBe(false); // platform-scoped check
  });

  it('toggle adds when absent, removes when present', () => {
    let selected: PermissionInput[] = [];
    selected = togglePermission(selected, 'tool', 'read');
    expect(isPermissionSelected(selected, 'tool', 'read')).toBe(true);

    selected = togglePermission(selected, 'tool', 'read');
    expect(selected).toEqual([]);
  });

  it('toggle is scoped: toggling app-1 does not affect app-2', () => {
    let selected: PermissionInput[] = [];
    selected = togglePermission(selected, 'indexes', 'write', 'app-1');
    selected = togglePermission(selected, 'indexes', 'write', 'app-2');
    expect(selected).toHaveLength(2);

    selected = togglePermission(selected, 'indexes', 'write', 'app-1');
    expect(selected).toEqual([{ resource: 'indexes', action: 'write', appId: 'app-2' }]);
  });

  it('does not mutate the input array', () => {
    const original: PermissionInput[] = [{ resource: 'tool', action: 'read', appId: null }];
    const next = togglePermission(original, 'tool', 'write');
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe('hasAllAllSelected / setAllAllSelected', () => {
  it('detects only a platform-scoped all:all row', () => {
    expect(hasAllAllSelected([{ resource: 'all', action: 'all', appId: null }])).toBe(true);
    expect(hasAllAllSelected([{ resource: 'all', action: 'all', appId: 'app-1' }])).toBe(false);
    expect(hasAllAllSelected([])).toBe(false);
  });

  it('enabling all:all clears every other selection', () => {
    const selected: PermissionInput[] = [
      { resource: 'tool', action: 'read', appId: null },
      { resource: 'indexes', action: 'write', appId: 'app-1' },
    ];
    expect(setAllAllSelected(selected, true)).toEqual([{ resource: 'all', action: 'all', appId: null }]);
  });

  it('disabling all:all removes only that one row', () => {
    const selected: PermissionInput[] = [
      { resource: 'all', action: 'all', appId: null },
      { resource: 'tool', action: 'read', appId: null },
    ];
    expect(setAllAllSelected(selected, false)).toEqual([{ resource: 'tool', action: 'read', appId: null }]);
  });
});

describe('countForScope', () => {
  it('counts only grants for the given scope (platform = null)', () => {
    const selected: PermissionInput[] = [
      { resource: 'tool', action: 'read', appId: null },
      { resource: 'tool', action: 'write', appId: null },
      { resource: 'indexes', action: 'read', appId: 'app-1' },
    ];
    expect(countForScope(selected, null)).toBe(2);
    expect(countForScope(selected, 'app-1')).toBe(1);
    expect(countForScope(selected, 'app-2')).toBe(0);
  });
});

describe('formatResourceLabel / formatActionLabel', () => {
  it('splits camelCase and title-cases resource names', () => {
    expect(formatResourceLabel('apiKey')).toBe('Api Key');
    expect(formatResourceLabel('logForwarding')).toBe('Log Forwarding');
    expect(formatResourceLabel('tool')).toBe('Tool');
  });

  it('special-cases the "all" resource', () => {
    expect(formatResourceLabel('all')).toBe('All resources');
  });

  it('title-cases actions and special-cases "all"', () => {
    expect(formatActionLabel('read')).toBe('Read');
    expect(formatActionLabel('all')).toBe('All actions');
  });
});

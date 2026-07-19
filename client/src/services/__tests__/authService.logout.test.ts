import { describe, it, expect, beforeEach } from 'vitest';
import { logout } from '../authService';

/**
 * Nothing scoped to the signed-in organization may survive a logout, or the
 * next session in this browser reads the previous session's values.
 */
describe('authService.logout', () => {
  const TENANT_SCOPED = [
    'token',
    'user',
    'veltrix_remember_me',
    'customerId',
    'veltrix_permissions_snapshot',
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears every tenant-scoped key from localStorage and sessionStorage', () => {
    for (const key of TENANT_SCOPED) {
      localStorage.setItem(key, 'tenant-a-value');
      sessionStorage.setItem(key, 'tenant-a-value');
    }

    logout();

    for (const key of TENANT_SCOPED) {
      expect(localStorage.getItem(key), `localStorage.${key}`).toBeNull();
      expect(sessionStorage.getItem(key), `sessionStorage.${key}`).toBeNull();
    }
  });

  it('preserves user preferences that are not tenant-scoped', () => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('sidebar-collapsed', 'true');

    logout();

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
  });
});

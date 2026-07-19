import { describe, it, expect, vi } from 'vitest';
import { resolveSidebarAppGroups } from '../resolveSidebarNav';
import type { EnabledApp } from '../../../../services/appService';

function makeApp(overrides: Partial<EnabledApp> = {}): EnabledApp {
  return {
    appId: 'splunk-enterprise',
    name: 'Splunk Enterprise',
    version: '1.1.0',
    icon: '🔍',
    category: 'SIEM',
    pages: [],
    configurationTypes: [],
    ...overrides,
  };
}

describe('resolveSidebarAppGroups', () => {
  it('includes only nav: "sidebar" pages and excludes "tab"/"hidden"', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/indexes', component: 'Indexes', label: 'Indexes', nav: 'sidebar' },
          { path: '/indexes/detail', component: 'IndexDetail', label: 'Detail', nav: 'tab', parent: '/indexes' },
          { path: '/internal', component: 'Internal', label: 'Internal', nav: 'hidden' },
        ],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    expect(groups).toHaveLength(1);
    expect(groups[0].sections.flatMap((s) => s.pages).map((p) => p.label)).toEqual(['Indexes']);
  });

  it('falls back to the legacy `sidebar: true` boolean when `nav` is absent', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/indexes', component: 'Indexes', label: 'Indexes', sidebar: true },
          { path: '/hidden-page', component: 'Hidden', label: 'Hidden', sidebar: false },
        ],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    const labels = groups[0].sections.flatMap((s) => s.pages).map((p) => p.label);
    expect(labels).toEqual(['Indexes']);
  });

  it('sorts pages by order ascending, then by label', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/c', component: 'C', label: 'Charlie', nav: 'sidebar', order: 2 },
          { path: '/a', component: 'A', label: 'Alpha', nav: 'sidebar' }, // no order -> defaults to 0
          { path: '/b', component: 'B', label: 'Bravo', nav: 'sidebar', order: 2 },
        ],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    const labels = groups[0].sections.flatMap((s) => s.pages).map((p) => p.label);
    // Alpha (order 0) first, then Bravo/Charlie (both order 2) tie-broken alphabetically.
    expect(labels).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('buckets pages into sections by `group`, preserving first-appearance order', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/roles', component: 'Roles', label: 'Roles', nav: 'sidebar', group: 'Configuration', order: 2 },
          { path: '/indexes', component: 'Indexes', label: 'Indexes', nav: 'sidebar', group: 'Configuration', order: 1 },
          { path: '/byol', component: 'BYOL', label: 'BYOL Infrastructure', nav: 'sidebar', group: 'Infrastructure', order: 3 },
        ],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    expect(groups[0].sections.map((s) => s.group)).toEqual(['Configuration', 'Infrastructure']);
    expect(groups[0].sections[0].pages.map((p) => p.label)).toEqual(['Indexes', 'Roles']);
    expect(groups[0].sections[1].pages.map((p) => p.label)).toEqual(['BYOL Infrastructure']);
  });

  it('nests pages under their owning app rather than flattening at the root', () => {
    const apps = [
      makeApp({
        appId: 'splunk-enterprise',
        name: 'Splunk Enterprise',
        pages: [{ path: '/indexes', component: 'Indexes', label: 'Indexes', nav: 'sidebar' }],
      }),
      makeApp({
        appId: 'other-app',
        name: 'Other App',
        pages: [{ path: '/dashboard', component: 'Dashboard', label: 'Dashboard', nav: 'sidebar' }],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    expect(groups.map((g) => g.appId)).toEqual(['splunk-enterprise', 'other-app']);
    expect(groups[0].sections.flatMap((s) => s.pages).every((p) => p.appId === 'splunk-enterprise')).toBe(true);
  });

  it('omits apps that contribute no visible sidebar pages', () => {
    const apps = [
      makeApp({ pages: [{ path: '/hidden', component: 'Hidden', label: 'Hidden', nav: 'hidden' }] }),
    ];
    expect(resolveSidebarAppGroups(apps)).toHaveLength(0);
  });

  it('hides pages with requiresPermission when a permission check denies access', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/allowed', component: 'Allowed', label: 'Allowed', nav: 'sidebar' },
          {
            path: '/restricted',
            component: 'Restricted',
            label: 'Restricted',
            nav: 'sidebar',
            requiresPermission: { resource: 'billing', action: 'manage' },
          },
        ],
      }),
    ];

    const hasPermission = vi.fn().mockReturnValue(false);
    const groups = resolveSidebarAppGroups(apps, { hasPermission });

    const labels = groups[0].sections.flatMap((s) => s.pages).map((p) => p.label);
    expect(labels).toEqual(['Allowed']);
    expect(hasPermission).toHaveBeenCalledWith('billing', 'manage', { appId: 'splunk-enterprise' });
  });

  it('shows requiresPermission pages when the permission check grants access, scoped to the owning app', () => {
    const apps = [
      makeApp({
        appId: 'splunk-enterprise',
        pages: [
          {
            path: '/restricted',
            component: 'Restricted',
            label: 'Restricted',
            nav: 'sidebar',
            requiresPermission: { resource: 'billing', action: 'manage' },
          },
        ],
      }),
    ];

    const hasPermission = vi.fn().mockReturnValue(true);
    const groups = resolveSidebarAppGroups(apps, { hasPermission });

    expect(groups[0].sections.flatMap((s) => s.pages).map((p) => p.label)).toEqual(['Restricted']);
    expect(hasPermission).toHaveBeenCalledWith('billing', 'manage', { appId: 'splunk-enterprise' });
  });

  it('FAILS CLOSED: hides requiresPermission pages when no permission source is provided at all', () => {
    const apps = [
      makeApp({
        pages: [
          { path: '/allowed', component: 'Allowed', label: 'Allowed', nav: 'sidebar' },
          {
            path: '/restricted',
            component: 'Restricted',
            label: 'Restricted',
            nav: 'sidebar',
            requiresPermission: { resource: 'billing', action: 'manage' },
          },
        ],
      }),
    ];

    const groups = resolveSidebarAppGroups(apps);
    expect(groups[0].sections.flatMap((s) => s.pages).map((p) => p.label)).toEqual(['Allowed']);
  });

  it('pages with no requiresPermission are unaffected by a denying permission source', () => {
    const apps = [
      makeApp({
        pages: [{ path: '/open', component: 'Open', label: 'Open', nav: 'sidebar' }],
      }),
    ];

    const hasPermission = vi.fn().mockReturnValue(false);
    const groups = resolveSidebarAppGroups(apps, { hasPermission });

    expect(groups[0].sections.flatMap((s) => s.pages).map((p) => p.label)).toEqual(['Open']);
    expect(hasPermission).not.toHaveBeenCalled();
  });
});

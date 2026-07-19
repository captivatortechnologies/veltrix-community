import { describe, it, expect } from 'vitest';
import {
  INSTALLED_APPS_PATH,
  MARKETPLACE_PATH,
  isInstalledAppsRouteActive,
  isMarketplaceRouteActive,
} from '../installedAppsLink';

describe('installedAppsLink', () => {
  it('points "Apps" at the installed-apps route', () => {
    expect(INSTALLED_APPS_PATH).toBe('/apps');
  });

  it('points "Marketplace" at the catalog route', () => {
    expect(MARKETPLACE_PATH).toBe('/marketplace');
  });

  describe('isInstalledAppsRouteActive', () => {
    it('is true on /apps', () => {
      expect(isInstalledAppsRouteActive('/apps')).toBe(true);
    });

    it('is true on an installed app overview page (/apps/:appId)', () => {
      expect(isInstalledAppsRouteActive('/apps/splunk-enterprise')).toBe(true);
    });

    it('is true on an installed app sub-page (/apps/:appId/*)', () => {
      expect(isInstalledAppsRouteActive('/apps/splunk-enterprise/indexes')).toBe(true);
    });

    it('is false on the Marketplace catalog (/marketplace)', () => {
      expect(isInstalledAppsRouteActive('/marketplace')).toBe(false);
    });

    it('is false on unrelated routes', () => {
      expect(isInstalledAppsRouteActive('/reports')).toBe(false);
      expect(isInstalledAppsRouteActive('/')).toBe(false);
    });
  });

  describe('isMarketplaceRouteActive', () => {
    it('is true on exactly /marketplace', () => {
      expect(isMarketplaceRouteActive('/marketplace')).toBe(true);
    });

    it('is false on the Apps page and installed app pages', () => {
      expect(isMarketplaceRouteActive('/apps')).toBe(false);
      expect(isMarketplaceRouteActive('/apps/splunk-enterprise')).toBe(false);
      expect(isMarketplaceRouteActive('/apps/splunk-enterprise/indexes')).toBe(false);
    });

    it('is false on unrelated routes', () => {
      expect(isMarketplaceRouteActive('/reports')).toBe(false);
    });
  });

  it('never agrees with isInstalledAppsRouteActive for the same location', () => {
    const locations = [
      '/apps',
      '/apps/splunk-enterprise',
      '/apps/splunk-enterprise/indexes',
      '/marketplace',
      '/reports',
      '/',
    ];
    for (const pathname of locations) {
      expect(isMarketplaceRouteActive(pathname) && isInstalledAppsRouteActive(pathname)).toBe(false);
    }
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Database,
  Shield,
  Home,
  Link,
  RefreshCw,
  Zap,
  Globe,
  Route,
  ShieldAlert,
  ShieldCheck,
  Lock,
  KeyRound,
  ScrollText,
  Fingerprint,
  Users,
  Boxes,
  Package,
  Network,
  Plug,
  AppWindow,
  Bell,
  Folder,
} from 'lucide-react';
import {
  resolveAppPageIcon,
  resolveConfigGroupIcon,
  getBadgeColor,
  AppIconBadge,
  AppPageIcon,
} from '../sidebarIcons';

describe('resolveAppPageIcon', () => {
  it('resolves known icon names case-insensitively', () => {
    expect(resolveAppPageIcon('database')).toBe(Database);
    expect(resolveAppPageIcon('Database')).toBe(Database);
    expect(resolveAppPageIcon(' shield ')).toBe(Shield);
  });

  // Regression: these names are declared by shipped app manifests (Overview=home,
  // Connections=link, Upgrades=refresh-cw, …) but were missing from the map, so
  // their collapsed-rail icons fell back to bare letters (O/C/U) in production.
  it('resolves the common manifest icon names that were previously unmapped', () => {
    expect(resolveAppPageIcon('home')).toBe(Home);
    expect(resolveAppPageIcon('link')).toBe(Link);
    expect(resolveAppPageIcon('refresh-cw')).toBe(RefreshCw);
    expect(resolveAppPageIcon('zap')).toBe(Zap);
  });

  it('returns null for unknown or missing icon names', () => {
    expect(resolveAppPageIcon('some-unmapped-icon')).toBeNull();
    expect(resolveAppPageIcon(undefined)).toBeNull();
    expect(resolveAppPageIcon('')).toBeNull();
  });
});

describe('resolveConfigGroupIcon', () => {
  // Real-world group labels declared across shipped app manifests (Cloudflare,
  // Okta, HashiCorp Vault, Zscaler, …) — see apps/*/manifest.yaml. Each must
  // resolve to a real icon, never the generic fallback, and a compound label
  // should resolve on its more specific term.
  it('maps real manifest group labels to a representative icon', () => {
    expect(resolveConfigGroupIcon('Zone')).toBe(Globe);
    expect(resolveConfigGroupIcon('WAF & Security')).toBe(ShieldAlert);
    expect(resolveConfigGroupIcon('Rules & Lists')).toBe(ScrollText);
    expect(resolveConfigGroupIcon('Zero Trust · Access')).toBe(ShieldCheck);
    expect(resolveConfigGroupIcon('Zero Trust · Gateway')).toBe(Route);
    expect(resolveConfigGroupIcon('Policies & Rules')).toBe(ScrollText);
    expect(resolveConfigGroupIcon('Directory')).toBe(Users);
    expect(resolveConfigGroupIcon('Authentication')).toBe(KeyRound);
    expect(resolveConfigGroupIcon('Secrets')).toBe(Lock);
    expect(resolveConfigGroupIcon('Identity')).toBe(Fingerprint);
    expect(resolveConfigGroupIcon('Integrations')).toBe(Plug);
    expect(resolveConfigGroupIcon('Applications')).toBe(AppWindow);
    expect(resolveConfigGroupIcon('Branding & Notifications')).toBe(Bell);
    expect(resolveConfigGroupIcon('Credentials & Connectors')).toBe(Lock);
    expect(resolveConfigGroupIcon('ZIA · Objects & Groups')).toBe(Boxes);
    expect(resolveConfigGroupIcon('Assets')).toBe(Package);
    expect(resolveConfigGroupIcon('Network & Access')).toBe(Network);
  });

  it('is case-insensitive', () => {
    expect(resolveConfigGroupIcon('zero trust · gateway')).toBe(Route);
    expect(resolveConfigGroupIcon('AUTHENTICATION')).toBe(KeyRound);
  });

  it('prefers the more specific term in a compound label (gateway over the broader zero-trust rule)', () => {
    expect(resolveConfigGroupIcon('Zero Trust · Gateway')).not.toBe(ShieldCheck);
    expect(resolveConfigGroupIcon('Zero Trust · Gateway')).toBe(Route);
  });

  it('falls back to a generic "group of things" icon for an unrecognized label, never a bare letter', () => {
    expect(resolveConfigGroupIcon('Access')).toBe(Folder);
    expect(resolveConfigGroupIcon('Some Made Up Group Name')).toBe(Folder);
  });
});

describe('getBadgeColor', () => {
  it('is deterministic for the same seed', () => {
    expect(getBadgeColor('splunk-enterprise')).toBe(getBadgeColor('splunk-enterprise'));
  });

  it('returns a tailwind background class', () => {
    expect(getBadgeColor('crowdstrike-edr')).toMatch(/^bg-\w+-\d+$/);
  });
});

describe('AppIconBadge', () => {
  it('renders the first letter of the label, uppercased', () => {
    render(<AppIconBadge label="indexes" seed="splunk-enterprise" />);
    expect(screen.getByText('I')).toBeInTheDocument();
  });

  it('falls back to a question mark for an empty label', () => {
    render(<AppIconBadge label="   " seed="x" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

describe('AppPageIcon', () => {
  it('renders the mapped Lucide icon when the name is recognized', () => {
    const { container } = render(<AppPageIcon iconName="database" label="Indexes" seed="splunk-enterprise" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the initials badge fallback when the name is unrecognized', () => {
    render(<AppPageIcon iconName="not-a-real-icon" label="Custom Page" seed="some-app" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});

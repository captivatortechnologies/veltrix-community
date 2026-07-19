import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Database, Shield, Home, Link, RefreshCw, Zap } from 'lucide-react';
import { resolveAppPageIcon, getBadgeColor, AppIconBadge, AppPageIcon } from '../sidebarIcons';

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

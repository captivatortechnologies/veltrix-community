import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Breadcrumbs from '../Breadcrumbs';
import type { EnabledApp } from '../../../services/appService';

const mockEnabledApps: EnabledApp[] = [];

vi.mock('../../../contexts/AppContext', () => ({
  useApps: () => ({ enabledApps: mockEnabledApps }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumbs />
    </MemoryRouter>
  );
}

describe('Breadcrumbs', () => {
  it('renders nothing on the home page', () => {
    const { container } = renderAt('/');
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a static route trail with humanized labels', () => {
    renderAt('/settings/keys-token');
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Keys & Tokens')).toBeInTheDocument();
  });

  it('marks the last crumb as the current page and does not link it', () => {
    renderAt('/pipeline/drift');
    const current = screen.getByText('Drift');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
  });

  it('links intermediate crumbs back to their route', () => {
    renderAt('/pipeline/drift');
    const pipelineLink = screen.getByText('Pipeline');
    expect(pipelineLink.closest('a')).toHaveAttribute('href', '/pipeline');
  });

  it('resolves an installed app name for /apps/:appId instead of the raw slug', () => {
    mockEnabledApps.push({
      appId: 'splunk-enterprise',
      name: 'Splunk Enterprise',
      version: '1.1.0',
      category: 'SIEM',
      pages: [{ path: '/indexes', label: 'Indexes', icon: 'database', sidebar: true }],
      configurationTypes: [],
    });

    renderAt('/apps/splunk-enterprise/indexes');
    expect(screen.getByText('Splunk Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Indexes')).toBeInTheDocument();

    mockEnabledApps.length = 0;
  });

  it('falls back to a humanized slug for unknown segments', () => {
    renderAt('/apps/some-unregistered-app');
    expect(screen.getByText('Some Unregistered App')).toBeInTheDocument();
  });

  it('labels the dedicated Installed Apps route', () => {
    renderAt('/installed-apps');
    expect(screen.getByText('Installed Apps')).toBeInTheDocument();
  });
});

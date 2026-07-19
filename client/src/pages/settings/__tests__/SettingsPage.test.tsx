import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import SettingsPage from '../index';

describe('SettingsPage', () => {
  it('renders a heading and links to every settings sub-page', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    const expectedLinks: Array<[string, string]> = [
      ['Access Control', '/access-control'],
      ['Organization', '/settings/organization'],
      ['Keys & Tokens', '/settings/keys-token'],
      ['Connectivity (ZTNA)', '/settings/connectivity'],
      ['Cloud Accounts', '/settings/cloud-accounts'],
      ['Remote Access', '/settings/remote-access'],
      ['Logs', '/settings/logs'],
    ];

    expectedLinks.forEach(([title, href]) => {
      const heading = screen.getByRole('heading', { name: title });
      const link = heading.closest('a');
      expect(link).toHaveAttribute('href', href);
    });

    // Billing is a hosted-commercial-only surface, not part of the
    // self-hosted Community Edition — it must never appear here.
    expect(screen.queryByRole('heading', { name: 'Billing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /billing/i })).not.toBeInTheDocument();
  });
});

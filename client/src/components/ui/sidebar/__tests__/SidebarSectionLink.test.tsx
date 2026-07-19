import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { PackageCheck } from 'lucide-react';
import SidebarSectionLink from '../SidebarSectionLink';

function renderLink(props: Partial<React.ComponentProps<typeof SidebarSectionLink>> = {}) {
  return render(
    <MemoryRouter>
      <SidebarSectionLink
        to="/apps?status=installed"
        label="Installed Apps"
        icon={<PackageCheck size={18} />}
        isActive={false}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('SidebarSectionLink', () => {
  it('renders as a real link (not just a label) with the header text visible', () => {
    renderLink();
    const link = screen.getByRole('link', { name: 'Installed Apps' });
    expect(link).toHaveAttribute('href', '/apps?status=installed');
    expect(link).toHaveTextContent('Installed Apps');
  });

  it('marks the link aria-current="page" when active', () => {
    renderLink({ isActive: true });
    expect(screen.getByRole('link', { name: 'Installed Apps' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current when inactive', () => {
    renderLink({ isActive: false });
    expect(screen.getByRole('link', { name: 'Installed Apps' })).not.toHaveAttribute('aria-current');
  });

  it('is keyboard focusable', async () => {
    const user = userEvent.setup();
    renderLink();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Installed Apps' })).toHaveFocus();
  });

  it('collapses to an icon-only link with an accessible name and a tooltip', async () => {
    const user = userEvent.setup();
    renderLink({ isCollapsed: true });

    // The text header itself is not rendered when collapsed...
    expect(screen.queryByText('Installed Apps', { selector: 'a' })).not.toBeInTheDocument();

    // ...but the link still has an accessible name via aria-label, not just a
    // hover-only tooltip - a tooltip alone can't supply an accessible name.
    const link = screen.getByRole('link', { name: 'Installed Apps' });
    await user.tab();
    expect(link).toHaveFocus();

    // The floating visual tooltip also appears on focus, for sighted keyboard users.
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Installed Apps');
  });

  it('keeps aria-current when active and collapsed', () => {
    renderLink({ isCollapsed: true, isActive: true });
    expect(screen.getByRole('link', { name: 'Installed Apps' })).toHaveAttribute('aria-current', 'page');
  });

  describe('accessibleLabel (collapsed-only accessible name override)', () => {
    it('uses accessibleLabel for the collapsed accessible name/tooltip when provided', async () => {
      const user = userEvent.setup();
      renderLink({ isCollapsed: true, accessibleLabel: 'Installed apps for your organization' });

      const link = screen.getByRole('link', { name: 'Installed apps for your organization' });
      expect(link).toBeInTheDocument();

      await user.tab();
      expect(link).toHaveFocus();
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(
        'Installed apps for your organization'
      );
    });

    it('does not affect the expanded (visible text) link - avoids a Label-in-Name mismatch', () => {
      renderLink({ isCollapsed: false, accessibleLabel: 'Installed apps for your organization' });

      // The expanded link's accessible name comes from its own visible text,
      // not the collapsed-only override.
      const link = screen.getByRole('link', { name: 'Installed Apps' });
      expect(link).toHaveTextContent('Installed Apps');
      expect(screen.queryByRole('link', { name: 'Installed apps for your organization' })).not.toBeInTheDocument();
    });
  });
});

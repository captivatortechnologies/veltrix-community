import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Home } from 'lucide-react';
import SidebarNavItem from '../SidebarNavItem';

function renderItem(props: Partial<React.ComponentProps<typeof SidebarNavItem>> = {}) {
  return render(
    <MemoryRouter>
      <SidebarNavItem
        to="/pipeline"
        icon={<Home size={20} />}
        label="Pipeline"
        isActive={false}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('SidebarNavItem', () => {
  it('renders a link with the label when expanded', () => {
    renderItem();
    const link = screen.getByRole('link', { name: 'Pipeline' });
    expect(link).toHaveAttribute('href', '/pipeline');
  });

  it('marks the active item with aria-current="page"', () => {
    renderItem({ isActive: true });
    expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current when inactive', () => {
    renderItem({ isActive: false });
    expect(screen.getByRole('link', { name: 'Pipeline' })).not.toHaveAttribute('aria-current');
  });

  it('hides the visible text label when collapsed but keeps an accessible name via aria-label', async () => {
    const user = userEvent.setup();
    renderItem({ isCollapsed: true });

    // Label text is not rendered inline when collapsed...
    expect(screen.queryByText('Pipeline', { selector: 'span.flex-1' })).not.toBeInTheDocument();

    // ...but the link still has an accessible name (aria-label), not just a
    // hover-only tooltip - a tooltip alone can't supply an accessible name.
    const link = screen.getByRole('link', { name: 'Pipeline' });
    await user.tab();
    expect(link).toHaveFocus();

    // The floating visual tooltip also appears on focus, for sighted keyboard users.
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Pipeline');
  });

  it('renders as an accessible disclosure button when it controls a submenu', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderItem({
      label: 'Reports',
      hasSubmenu: true,
      isSubmenuOpen: false,
      submenuId: 'reports-submenu',
      onToggle,
    });

    const button = screen.getByRole('button', { name: 'Reports' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'reports-submenu');

    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders as a plain link (not a button) when collapsed, even with a submenu', () => {
    renderItem({ label: 'Reports', hasSubmenu: true, isCollapsed: true, onToggle: vi.fn() });
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

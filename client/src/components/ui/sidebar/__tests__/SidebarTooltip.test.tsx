import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SidebarTooltip from '../SidebarTooltip';

describe('SidebarTooltip', () => {
  it('does not render a tooltip until hovered/focused', () => {
    render(
      <SidebarTooltip label="Pipeline">
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });

  it('shows the tooltip on mouse enter and hides it on mouse leave', () => {
    render(
      <SidebarTooltip label="Pipeline">
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Pipeline' });

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Pipeline');

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and hides it on blur (keyboard users)', () => {
    render(
      <SidebarTooltip label="Pipeline">
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Pipeline' });

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Pipeline');

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });

  it('is decorative (aria-hidden) since the trigger already carries the accessible name', () => {
    render(
      <SidebarTooltip label="Pipeline">
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Pipeline' }));
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders through a portal (outside any scrollable ancestor) so it cannot be clipped', () => {
    const { container } = render(
      <div style={{ overflow: 'auto' }}>
        <SidebarTooltip label="Pipeline">
          <button aria-label="Pipeline">icon</button>
        </SidebarTooltip>
      </div>
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Pipeline' }));

    const tooltip = screen.getByRole('tooltip', { hidden: true });
    // Not a descendant of the scrollable wrapper that renders this component's output...
    expect(container.contains(tooltip)).toBe(false);
    // ...but still discoverable in the document (portalled to document.body).
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it('dismisses on scroll rather than keeping a stale position', () => {
    render(
      <SidebarTooltip label="Pipeline">
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Pipeline' }));
    expect(screen.getByRole('tooltip', { hidden: true })).toBeInTheDocument();

    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });

  it('renders children unchanged, with no tooltip wiring, when disabled', () => {
    render(
      <SidebarTooltip label="Pipeline" disabled>
        <button aria-label="Pipeline">icon</button>
      </SidebarTooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Pipeline' });
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Tabs from '../Tabs';

const tabs = [
  { key: 'a', label: 'Alpha', content: <div>Alpha content</div> },
  { key: 'b', label: 'Beta', content: <div>Beta content</div> },
  { key: 'c', label: 'Gamma', content: <div>Gamma content</div>, disabled: true },
];

describe('Tabs', () => {
  it('renders a tablist with the correct ARIA roles and the first tab selected by default', () => {
    render(<Tabs tabs={tabs} />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabButtons = screen.getAllByRole('tab');
    expect(tabButtons).toHaveLength(3);
    expect(tabButtons[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabButtons[1]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Alpha content');
  });

  it('selects a tab on click and updates the panel', () => {
    render(<Tabs tabs={tabs} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));

    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Beta content');
  });

  it('does not select a disabled tab on click', () => {
    render(<Tabs tabs={tabs} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }));

    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Alpha content');
  });

  it('supports ArrowRight/ArrowLeft keyboard navigation, skipping disabled tabs', () => {
    render(<Tabs tabs={tabs} />);

    const [first, second] = screen.getAllByRole('tab');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveAttribute('aria-selected', 'true');

    // From Beta, ArrowRight should skip the disabled Gamma tab and wrap back to Alpha.
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Home/End jump to the first/last enabled tab', () => {
    render(<Tabs tabs={tabs} />);

    const beta = screen.getByRole('tab', { name: 'Beta' });
    fireEvent.click(beta);
    fireEvent.keyDown(beta, { key: 'End' });
    // Gamma is disabled, so End lands on the last ENABLED tab (Beta itself here since it's index 1
    // and index 2 is disabled) — assert selection stays a valid, enabled tab.
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(beta, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  });

  it('supports controlled mode via activeIndex + onTabChange', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<Tabs tabs={tabs} activeIndex={0} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onTabChange).toHaveBeenCalledWith(1);
    // Controlled: selection does not change until the parent passes a new activeIndex.
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');

    rerender(<Tabs tabs={tabs} activeIndex={1} onTabChange={onTabChange} />);
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
  });

  it('links the panel to its tab via aria-labelledby/aria-controls', () => {
    render(<Tabs tabs={tabs} />);

    const activeTab = screen.getByRole('tab', { name: 'Alpha' });
    const panel = screen.getByRole('tabpanel');
    expect(activeTab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(activeTab.id);
  });
});

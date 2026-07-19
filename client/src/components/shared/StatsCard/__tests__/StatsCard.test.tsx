import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FlaskConical } from 'lucide-react';
import StatsCard, { type StatsCardVariant } from '../StatsCard';

describe('StatsCard', () => {
  it('renders the label and value', () => {
    render(<StatsCard label="Active Sandboxes" value={128} />);
    expect(screen.getByText('Active Sandboxes')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('renders a React node value as-is', () => {
    render(<StatsCard label="Status" value={<span data-testid="custom-value">OK</span>} />);
    expect(screen.getByTestId('custom-value')).toBeInTheDocument();
  });

  it('does not render an icon container when no icon is provided', () => {
    const { container } = render(<StatsCard label="Active Sandboxes" value={128} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  describe('icon container variant tinting', () => {
    const cases: Array<{ variant: StatsCardVariant; expectedClass: string }> = [
      { variant: 'default', expectedClass: 'bg-surface-hover' },
      { variant: 'primary', expectedClass: 'bg-primary-subtle' },
      { variant: 'success', expectedClass: 'bg-success-subtle' },
      { variant: 'warning', expectedClass: 'bg-warning-subtle' },
      { variant: 'danger', expectedClass: 'bg-danger-subtle' },
      { variant: 'info', expectedClass: 'bg-info-subtle' },
    ];

    it.each(cases)('applies $expectedClass for variant="$variant"', ({ variant, expectedClass }) => {
      const { container } = render(
        <StatsCard
          label="Active Sandboxes"
          value={128}
          variant={variant}
          icon={<FlaskConical data-testid="stats-icon" size={20} />}
        />
      );
      const iconContainer = screen.getByTestId('stats-icon').closest('div');
      expect(iconContainer).toHaveClass(expectedClass);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('delta', () => {
    it('renders an "up" delta with success color and a trend-up icon', () => {
      render(
        <StatsCard
          label="Active Sandboxes"
          value={128}
          delta={{ value: '+12.5%', direction: 'up', label: 'vs last month' }}
        />
      );
      const deltaValue = screen.getByText('+12.5%');
      expect(deltaValue.closest('div')).toHaveClass('text-success');
      expect(screen.getByText('vs last month')).toBeInTheDocument();
      expect(deltaValue.closest('div')?.querySelector('svg')).toBeInTheDocument();
    });

    it('renders a "down" delta with danger color and a trend-down icon', () => {
      render(<StatsCard label="Errors" value={4} delta={{ value: '-3.2%', direction: 'down' }} />);
      const deltaValue = screen.getByText('-3.2%');
      expect(deltaValue.closest('div')).toHaveClass('text-danger');
      expect(deltaValue.closest('div')?.querySelector('svg')).toBeInTheDocument();
    });

    it('renders a "neutral" delta with secondary color and a minus icon', () => {
      render(<StatsCard label="Uptime" value="99.9%" delta={{ value: '0.0%', direction: 'neutral' }} />);
      const deltaValue = screen.getByText('0.0%');
      expect(deltaValue.closest('div')).toHaveClass('text-content-secondary');
      expect(deltaValue.closest('div')?.querySelector('svg')).toBeInTheDocument();
    });

    it('omits the delta block entirely when no delta is passed', () => {
      const { container } = render(<StatsCard label="Active Sandboxes" value={128} />);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('hides the value and renders a skeleton placeholder instead', () => {
      render(<StatsCard label="Active Sandboxes" value={128} isLoading />);
      expect(screen.queryByText('128')).not.toBeInTheDocument();
      expect(screen.getByText('Active Sandboxes')).toBeInTheDocument();
    });

    it('hides the delta text and renders a skeleton placeholder instead', () => {
      render(
        <StatsCard
          label="Active Sandboxes"
          value={128}
          isLoading
          delta={{ value: '+12.5%', direction: 'up', label: 'vs last month' }}
        />
      );
      expect(screen.queryByText('+12.5%')).not.toBeInTheDocument();
      expect(screen.queryByText('vs last month')).not.toBeInTheDocument();
    });

    it('still renders a provided icon while loading', () => {
      render(
        <StatsCard
          label="Active Sandboxes"
          value={128}
          isLoading
          icon={<FlaskConical data-testid="stats-icon" size={20} />}
        />
      );
      expect(screen.getByTestId('stats-icon')).toBeInTheDocument();
    });
  });

  describe('clickable behavior', () => {
    it('fires onClick when clicked with the mouse', () => {
      const handleClick = vi.fn();
      render(<StatsCard label="Active Sandboxes" value={128} onClick={handleClick} />);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('fires onClick on Enter', () => {
      const handleClick = vi.fn();
      render(<StatsCard label="Active Sandboxes" value={128} onClick={handleClick} />);
      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('fires onClick on Space', () => {
      const handleClick = vi.fn();
      render(<StatsCard label="Active Sandboxes" value={128} onClick={handleClick} />);
      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick for unrelated keys', () => {
      const handleClick = vi.fn();
      render(<StatsCard label="Active Sandboxes" value={128} onClick={handleClick} />);
      fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('is focusable via tabIndex when clickable', () => {
      render(<StatsCard label="Active Sandboxes" value={128} onClick={vi.fn()} />);
      expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('non-clickable behavior', () => {
    it('has no button role or tabIndex when onClick is not provided', () => {
      render(<StatsCard label="Active Sandboxes" value={128} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not attach a tabIndex attribute', () => {
      const { container } = render(<StatsCard label="Active Sandboxes" value={128} />);
      const card = container.firstElementChild as HTMLElement;
      expect(card).not.toHaveAttribute('tabindex');
      expect(card).not.toHaveAttribute('role');
    });
  });

  it('applies a custom className to the outer card', () => {
    const { container } = render(
      <StatsCard label="Active Sandboxes" value={128} className="my-custom-class" />
    );
    expect(container.firstElementChild).toHaveClass('my-custom-class');
  });
});

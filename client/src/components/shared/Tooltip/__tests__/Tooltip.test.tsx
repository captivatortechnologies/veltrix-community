import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Tooltip from '../Tooltip';

describe('Tooltip', () => {
  it('links the trigger to the tooltip via aria-describedby', () => {
    render(
      <Tooltip content="Sandboxes">
        <button>Icon</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Icon' });
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Sandboxes');
  });

  it('shows immediately on focus (no delay for keyboard users)', async () => {
    render(
      <Tooltip content="Sandboxes" delayDuration={10000}>
        <button>Icon</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Icon' });
    fireEvent.focus(trigger);

    const tooltip = screen.getByRole('tooltip');
    await waitFor(() => expect(tooltip).toHaveClass('opacity-100'));
  });

  it('hides on blur', async () => {
    render(
      <Tooltip content="Sandboxes">
        <button>Icon</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Icon' });
    fireEvent.focus(trigger);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveClass('opacity-100'));

    fireEvent.blur(trigger);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveClass('opacity-0'));
  });

  it('hides on Escape', async () => {
    render(
      <Tooltip content="Sandboxes">
        <button>Icon</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Icon' });
    fireEvent.focus(trigger);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveClass('opacity-100'));

    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveClass('opacity-0'));
  });

  it('renders no tooltip and no aria-describedby when content is empty', () => {
    render(
      <Tooltip content="">
        <button>Icon</button>
      </Tooltip>
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon' })).not.toHaveAttribute('aria-describedby');
  });

  it('renders no tooltip when disabled', () => {
    render(
      <Tooltip content="Sandboxes" disabled>
        <button>Icon</button>
      </Tooltip>
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('applies placement classes', () => {
    render(
      <Tooltip content="Sandboxes" placement="right">
        <button>Icon</button>
      </Tooltip>
    );

    expect(screen.getByRole('tooltip')).toHaveClass('left-full');
  });
});

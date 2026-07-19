import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OverlayPortal, BRAND_SCOPED_CSS_VARS } from '../OverlayPortal';

describe('OverlayPortal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('portals its children out of the local tree into document.body', () => {
    const { container } = render(
      <div data-testid="host">
        <OverlayPortal>
          <div data-testid="overlay-child">content</div>
        </OverlayPortal>
      </div>,
    );

    const child = screen.getByTestId('overlay-child');
    expect(child).toBeInTheDocument();
    // Portaled: it is NOT a descendant of the local host container…
    expect(container.querySelector('[data-testid="overlay-child"]')).toBeNull();
    // …but it IS attached under document.body.
    expect(document.body.contains(child)).toBe(true);
  });

  it('leaves an invisible in-tree anchor to read the scoped vars from', () => {
    const { container } = render(
      <OverlayPortal>
        <div>content</div>
      </OverlayPortal>,
    );

    const anchor = container.querySelector('span[aria-hidden="true"]') as HTMLElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor!.style.display).toBe('none');
  });

  it('mirrors the scoped brand CSS vars from the mount point onto the portal root', () => {
    const getPropertyValue = vi.fn((name: string) =>
      name === '--color-primary' ? '255 102 0' : '',
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue,
    } as unknown as CSSStyleDeclaration);

    render(
      <OverlayPortal>
        <div data-testid="overlay-child">content</div>
      </OverlayPortal>,
    );

    const portalRoot = screen.getByTestId('overlay-child').parentElement as HTMLElement;
    expect(portalRoot.style.getPropertyValue('--color-primary')).toBe('255 102 0');
    // Every brand-scoped var is queried from the anchor's computed style.
    for (const name of BRAND_SCOPED_CSS_VARS) {
      expect(getPropertyValue).toHaveBeenCalledWith(name);
    }
  });

  it('applies no scoped vars when inheritCssVars is empty', () => {
    render(
      <OverlayPortal inheritCssVars={[]}>
        <div data-testid="overlay-child">content</div>
      </OverlayPortal>,
    );

    const portalRoot = screen.getByTestId('overlay-child').parentElement as HTMLElement;
    expect(portalRoot.style.getPropertyValue('--color-primary')).toBe('');
  });
});

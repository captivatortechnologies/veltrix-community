import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarCollapse } from '../useSidebarCollapse';

function mockMatchMedia(matchesWide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matchesWide,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('useSidebarCollapse', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to expanded on wide viewports when no preference is saved', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current[0]).toBe(false);
  });

  it('defaults to collapsed on narrow viewports when no preference is saved', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current[0]).toBe(true);
  });

  it('honors a previously saved preference over the viewport default', () => {
    mockMatchMedia(true); // wide viewport, would default to expanded...
    window.localStorage.setItem('sidebar-collapsed', 'true'); // ...but user chose collapsed
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current[0]).toBe(true);
  });

  it('persists the collapse state to localStorage when toggled', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useSidebarCollapse());

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('sidebar-collapsed')).toBe('true');
  });
});

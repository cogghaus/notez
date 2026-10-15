import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutClass } from './useLayoutClass';

/** A matchMedia stand-in driven by a width: min-width queries only, with live change events. */
function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const registry: Array<{ min: number; mql: { matches: boolean }; listeners: Set<() => void> }> = [];

  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1]);
    const entry = {
      min,
      listeners: new Set<() => void>(),
      mql: {
        get matches() {
          return width >= min;
        },
        media: query,
        addEventListener: (_type: string, cb: () => void) => entry.listeners.add(cb),
        removeEventListener: (_type: string, cb: () => void) => entry.listeners.delete(cb),
      },
    };
    registry.push(entry);
    return entry.mql;
  }) as unknown as typeof window.matchMedia;

  return {
    setWidth(next: number) {
      const before = registry.map((e) => width >= e.min);
      width = next;
      registry.forEach((e, i) => {
        if (before[i] !== width >= e.min) e.listeners.forEach((cb) => cb());
      });
    },
    listenerCount: () => registry.reduce((n, e) => n + e.listeners.size, 0),
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('useLayoutClass', () => {
  it.each([
    [360, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [841, 'medium'],
    [1279, 'medium'],
    [1280, 'expanded'],
    [1920, 'expanded'],
  ])('maps %ipx to %s', (width, expected) => {
    installMatchMedia(width);
    const { result } = renderHook(() => useLayoutClass());
    expect(result.current).toBe(expected);
  });

  it('follows live width changes through the media query change events', () => {
    const mm = installMatchMedia(412);
    const { result } = renderHook(() => useLayoutClass());
    expect(result.current).toBe('compact');

    act(() => mm.setWidth(841));
    expect(result.current).toBe('medium');

    act(() => mm.setWidth(1400));
    expect(result.current).toBe('expanded');

    act(() => mm.setWidth(412));
    expect(result.current).toBe('compact');
  });

  it('removes its listeners on unmount', () => {
    const mm = installMatchMedia(412);
    const { unmount } = renderHook(() => useLayoutClass());
    expect(mm.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });

  it('treats an environment without matchMedia as expanded (desktop behaviour)', () => {
    // @ts-expect-error simulating an environment with no matchMedia
    window.matchMedia = undefined;
    const { result } = renderHook(() => useLayoutClass());
    expect(result.current).toBe('expanded');
  });
});

describe('useShell', () => {
  it('is true below xl and false from xl', async () => {
    const { useShell } = await import('./useLayoutClass');
    const mm = installMatchMedia(841);
    const { result } = renderHook(() => useShell());
    expect(result.current).toBe(true);
    act(() => mm.setWidth(1280));
    expect(result.current).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAfterViewportHeightChange } from './useKeepCaretVisible';
import { VIEWPORT_HEIGHT_EVENT } from './viewport';

const announce = () => window.dispatchEvent(new CustomEvent(VIEWPORT_HEIGHT_EVENT, { detail: { height: 300 } }));

describe('useAfterViewportHeightChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 16) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs the callback once, a frame after a burst of height changes', () => {
    const cb = vi.fn();
    renderHook(() => useAfterViewportHeightChange(cb));

    announce();
    announce();
    announce();
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAfterViewportHeightChange(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    announce();
    vi.advanceTimersByTime(20);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening and cancels a pending frame on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useAfterViewportHeightChange(cb));

    announce();
    unmount();
    vi.advanceTimersByTime(20);
    announce();
    vi.advanceTimersByTime(20);
    expect(cb).not.toHaveBeenCalled();
  });
});

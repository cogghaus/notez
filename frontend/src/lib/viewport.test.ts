import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewportHeight, APP_HEIGHT_VAR, VIEWPORT_HEIGHT_EVENT } from './viewport';

class FakeVisualViewport extends EventTarget {
  height: number;
  constructor(height: number) {
    super();
    this.height = height;
  }
}

function setVisualViewport(value: unknown) {
  Object.defineProperty(window, 'visualViewport', { value, configurable: true, writable: true });
}

const appHeight = () => document.documentElement.style.getPropertyValue(APP_HEIGHT_VAR);

describe('installViewportHeight', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    // Run rAF callbacks on the fake timer clock.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 16) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true, writable: true });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    setVisualViewport(undefined);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sets --app-h from visualViewport.height immediately and follows its resize events', () => {
    const vv = new FakeVisualViewport(693);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    expect(appHeight()).toBe('693px');

    vv.height = 351;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('351px');

    vv.height = 693;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('693px');
  });

  it('falls back to window.innerHeight when visualViewport is undefined', () => {
    setVisualViewport(undefined);
    cleanup = installViewportHeight();
    expect(appHeight()).toBe('700px');

    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true, writable: true });
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('500px');
  });

  it('throttles bursts of resize events to one update per frame', () => {
    const vv = new FakeVisualViewport(600);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    const setProperty = vi.spyOn(document.documentElement.style, 'setProperty');

    for (const h of [590, 560, 500, 420, 351]) {
      vv.height = h;
      vv.dispatchEvent(new Event('resize'));
    }
    vi.advanceTimersByTime(20);

    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(appHeight()).toBe('351px');
  });

  it('announces height changes (but not the initial value) on window', () => {
    const vv = new FakeVisualViewport(600);
    setVisualViewport(vv);
    const listener = vi.fn();
    window.addEventListener(VIEWPORT_HEIGHT_EVENT, listener);
    cleanup = installViewportHeight();
    expect(listener).not.toHaveBeenCalled();

    vv.height = 300;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(VIEWPORT_HEIGHT_EVENT, listener);
  });

  it('marks the keyboard open only when the visible area is much shorter than the layout viewport', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    expect(document.documentElement.getAttribute('data-kb')).toBe('closed');

    vv.height = 350;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(document.documentElement.getAttribute('data-kb')).toBe('open');

    // Browser chrome showing/hiding changes the height by less than the threshold.
    vv.height = 650;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(document.documentElement.getAttribute('data-kb')).toBe('closed');
  });

  it('removes the property and stops listening after cleanup', () => {
    const vv = new FakeVisualViewport(600);
    setVisualViewport(vv);
    const stop = installViewportHeight();
    expect(appHeight()).toBe('600px');

    stop();
    expect(appHeight()).toBe('');

    vv.height = 300;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('');
  });
});

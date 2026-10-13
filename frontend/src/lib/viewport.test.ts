import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewportHeight, APP_HEIGHT_VAR, VIEWPORT_HEIGHT_EVENT } from './viewport';

class FakeVisualViewport extends EventTarget {
  height: number;
  scale = 1;
  constructor(height: number) {
    super();
    this.height = height;
  }
}

function setInner(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

/** A focused text field: the keyboard can only be up while something editable has focus. */
function focusTextField(): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  ta.focus();
  return ta;
}

const kb = () => document.documentElement.getAttribute('data-kb');

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
    setInner(400, 700);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    setVisualViewport(undefined);
    document.body.innerHTML = '';
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

  it('marks the keyboard open when the visible area shrinks but the layout viewport does not (resizes-visual)', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    expect(kb()).toBe('closed');
    focusTextField();

    vv.height = 350;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Browser chrome showing/hiding changes the height by less than the threshold.
    vv.height = 650;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');
  });

  it('marks the keyboard open when the layout viewport shrinks with it (interactive-widget=resizes-content)', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    setInner(400, 350);
    vv.height = 350;
    window.dispatchEvent(new Event('resize'));
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('350px');
    expect(kb()).toBe('open');

    setInner(400, 700);
    vv.height = 700;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');
  });

  it('never reports the keyboard while nothing editable has focus', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();

    setInner(400, 350);
    vv.height = 350;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('350px');
    expect(kb()).toBe('closed');
  });

  it('re-baselines when the width changes (rotate, fold, unfold)', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    // Unfold to a wide, shorter screen while a field has focus: not a keyboard.
    setInner(840, 520);
    vv.height = 520;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');

    // Keyboard on the new screen.
    vv.height = 300;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');
  });

  it('stays open when the screen rotates or unfolds with the keyboard up (resizes-content)', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    // Keyboard opens in portrait; the layout viewport shrinks with it.
    setInner(400, 350);
    vv.height = 350;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Rotate to landscape with the keyboard still up: both heights are already reduced.
    setInner(700, 150);
    vv.height = 150;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Back to portrait, keyboard still up: the remembered portrait height applies.
    setInner(400, 350);
    vv.height = 350;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');
  });

  it('never reports a keyboard on a device without a touch screen', () => {
    vi.stubGlobal('navigator', { ...navigator, maxTouchPoints: 0 });
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    // Desktop window shrunk by more than the threshold while typing.
    setInner(400, 450);
    vv.height = 450;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');
  });

  it('does not count a focused checkbox as typing', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    box.focus();

    vv.height = 350;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');
  });

  it('re-evaluates when focus leaves, without waiting for a resize', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    const field = focusTextField();

    vv.height = 350;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    field.blur();
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');
  });

  it('closes when the keyboard goes down after a rotation estimate overshot (Android back)', () => {
    const vv = new FakeVisualViewport(800);
    setInner(400, 800);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    // Portrait keyboard (resizes-content).
    setInner(400, 330);
    vv.height = 330;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Rotate with the keyboard up: landscape estimated as 200 + 470 = 670 (real full height 330).
    setInner(800, 200);
    vv.height = 200;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Back closes the keyboard; focus stays in the editor.
    setInner(800, 330);
    vv.height = 330;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');

    // Keyboard again in landscape: measured against the corrected height.
    setInner(800, 150);
    vv.height = 150;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');
  });

  it('does not record a keyboard-shortened height when focus leaves before the keyboard closes', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    const field = focusTextField();

    setInner(400, 350);
    vv.height = 350;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');

    // Focus leaves; the keyboard is still on screen for this frame.
    field.blur();
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('closed');

    // Focus returns before the close resize ever arrives: still measured against 700.
    field.focus();
    vi.advanceTimersByTime(20);
    expect(kb()).toBe('open');
  });

  it('ignores pinch zoom: the shell keeps the layout height and the keyboard stays closed', () => {
    const vv = new FakeVisualViewport(700);
    setVisualViewport(vv);
    cleanup = installViewportHeight();
    focusTextField();

    vv.scale = 2;
    vv.height = 350;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(appHeight()).toBe('700px');
    expect(kb()).toBe('closed');
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

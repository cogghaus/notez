/**
 * Visible-viewport height tracking (mobile rework, docs/mobile/02-mobile-design-spec.md section 2).
 *
 * Chrome on Android keeps the layout viewport the same size when the on-screen keyboard opens and
 * shrinks only the visual viewport. Anything sized with `100vh` therefore ends up partly behind the
 * keyboard. This module mirrors `visualViewport.height` (falling back to `window.innerHeight`) into
 * the `--app-h` CSS custom property on <html>, so a shell can use `height: var(--app-h, 100dvh)`.
 *
 * Listeners are rAF-throttled. After the property changes, a `VIEWPORT_HEIGHT_EVENT` is dispatched
 * on `window` so components (for example the editors) can react once layout has the new height.
 */

export const APP_HEIGHT_VAR = '--app-h';
export const VIEWPORT_HEIGHT_EVENT = 'app-viewport-height';

/** Attribute on <html>: "open" while an on-screen keyboard is taking part of the screen. */
export const KEYBOARD_ATTR = 'data-kb';
const KEYBOARD_MIN_INSET = 120;

/**
 * Visible height in layout CSS pixels. Pinch zoom shrinks `visualViewport.height` by the zoom
 * factor without changing what fits on screen, so multiply it back out (scale is 1 when unzoomed).
 */
function currentHeight(): number {
  const vv = window.visualViewport;
  return vv ? vv.height * (vv.scale || 1) : window.innerHeight;
}

/** The keyboard can only be up while something that takes typing has focus. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
}

/**
 * Starts mirroring the visible height into `--app-h`. Safe to call once at app start. Returns a
 * cleanup function that removes the listeners and the custom property.
 */
export function installViewportHeight(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const root = document.documentElement;
  const vv = window.visualViewport ?? null;
  let frame = 0;
  let lastApplied: number | null = null;
  // Keyboard detection compares the visible height with the full-screen height at this width.
  // Comparing with innerHeight alone only works when the browser keeps the layout viewport
  // (Chrome's default); with interactive-widget=resizes-content (our meta) and in Gecko, innerHeight
  // shrinks with the keyboard. The baseline is re-taken whenever nothing editable has focus (no
  // keyboard possible) or the width changes (rotate, fold, unfold), and only grows while typing.
  // visualViewport.offsetTop is deliberately ignored: it moves when the page pans, not when the
  // keyboard takes height.
  let baseWidth = -1;
  let baseHeight = 0;

  const apply = () => {
    frame = 0;
    const height = Math.round(currentHeight());
    if (window.innerWidth !== baseWidth || !isTyping()) {
      baseWidth = window.innerWidth;
      baseHeight = Math.max(window.innerHeight, height);
    } else {
      baseHeight = Math.max(baseHeight, height);
    }
    root.setAttribute(KEYBOARD_ATTR, baseHeight - height > KEYBOARD_MIN_INSET ? 'open' : 'closed');

    if (height === lastApplied) return;
    const changed = lastApplied !== null;
    lastApplied = height;
    root.style.setProperty(APP_HEIGHT_VAR, `${height}px`);
    if (changed) {
      window.dispatchEvent(new CustomEvent(VIEWPORT_HEIGHT_EVENT, { detail: { height } }));
    }
  };

  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  // Set the initial value synchronously so the first paint already has it.
  apply();

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    root.style.removeProperty(APP_HEIGHT_VAR);
    root.removeAttribute(KEYBOARD_ATTR);
  };
}

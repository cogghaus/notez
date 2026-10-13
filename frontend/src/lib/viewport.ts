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

/** Attribute on <html>: "open" while the visible area is much shorter than the layout viewport. */
export const KEYBOARD_ATTR = 'data-kb';
const KEYBOARD_MIN_INSET = 120;

function currentHeight(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
  return vv ? vv.height : window.innerHeight;
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

  const apply = () => {
    frame = 0;
    const height = Math.round(currentHeight());
    if (height === lastApplied) return;
    const changed = lastApplied !== null;
    lastApplied = height;
    root.style.setProperty(APP_HEIGHT_VAR, `${height}px`);
    // Layout viewport unchanged but visible area shrunk: the on-screen keyboard (Chrome default).
    // When the browser resizes the layout viewport instead, the inset is ~0 and this stays closed.
    root.setAttribute(KEYBOARD_ATTR, window.innerHeight - height > KEYBOARD_MIN_INSET ? 'open' : 'closed');
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

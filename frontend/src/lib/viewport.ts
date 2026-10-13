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

/** Input types that bring up the on-screen keyboard. */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** The keyboard can only be up while something that takes typing has focus. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
}

/** No touch screen, no on-screen keyboard: a desktop window resize must never count as one. */
function hasTouchScreen(): boolean {
  return navigator.maxTouchPoints !== 0;
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
  // Keyboard detection compares the visible height with the full-screen height at the current
  // width. Comparing with innerHeight alone only works when the browser keeps the layout viewport
  // (Chrome's default); with interactive-widget=resizes-content (our meta) and in Gecko, innerHeight
  // shrinks with the keyboard. The full height is recorded per width (portrait, landscape, folded,
  // unfolded) whenever nothing editable has focus, so no keyboard can be up; while typing it only
  // grows. Rotating or unfolding with the keyboard up lands on a width with no record yet: estimate
  // it from the keyboard height just measured, and let the next keyboard-free reading correct it.
  // visualViewport.offsetTop is deliberately ignored: it moves when the page pans, not when the
  // keyboard takes height.
  const fullByWidth = new Map<number, number>();
  let keyboardOpen = false;
  let lastGap = 0;

  const apply = () => {
    frame = 0;
    const height = Math.round(currentHeight());
    const width = window.innerWidth;
    const full = Math.max(window.innerHeight, height);
    let open = false;
    if (!hasTouchScreen() || !isTyping()) {
      fullByWidth.set(width, full);
    } else {
      let base = fullByWidth.get(width);
      if (base === undefined) {
        base = keyboardOpen ? Math.max(full, height + lastGap) : full;
      }
      base = Math.max(base, full);
      fullByWidth.set(width, base);
      const gap = base - height;
      open = gap > KEYBOARD_MIN_INSET;
      if (open) lastGap = gap;
    }
    keyboardOpen = open;
    root.setAttribute(KEYBOARD_ATTR, open ? 'open' : 'closed');

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
  // Focus decides whether a short screen can be a keyboard, so re-evaluate when it moves.
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    root.style.removeProperty(APP_HEIGHT_VAR);
    root.removeAttribute(KEYBOARD_ATTR);
  };
}

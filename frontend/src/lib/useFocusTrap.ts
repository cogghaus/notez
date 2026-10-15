import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling shared by dialogs and sheets (spec 9.6), extracted from ConfirmDialog:
 * while `active`, Tab and Shift+Tab cycle inside `containerRef`; when it turns inactive (or
 * unmounts), focus returns to the opener on the next frame, after the dialog has left the DOM.
 *
 * The opener is the element focused when the dialog first renders active (render phase, before
 * autoFocus inside the dialog can steal it), or `options.opener` when the caller captured it
 * earlier, as ConfirmDialog does.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: { opener?: Element | null } = {},
): void {
  const openerRef = useRef<Element | null>(null);
  if (!active) {
    openerRef.current = null;
  } else if (openerRef.current === null) {
    openerRef.current = options.opener ?? (typeof document !== 'undefined' ? document.activeElement : null);
  }

  useEffect(() => {
    if (!active) return;
    // Read now: the next (inactive) render clears the ref before this cleanup runs
    const opener = openerRef.current;

    const handleTrapKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTrapKey);
    return () => {
      document.removeEventListener('keydown', handleTrapKey);
      // Defer to next frame so the dialog unmounts first. A container that is still connected means
      // the effect merely re-ran (StrictMode, changed deps), so the trap stays and focus is left alone.
      requestAnimationFrame(() => {
        // Intentionally the ref's value on the next frame: null once React unmounted the container
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (containerRef.current?.isConnected) return;
        if (opener instanceof HTMLElement) opener.focus();
      });
    };
  }, [active, containerRef]);
}

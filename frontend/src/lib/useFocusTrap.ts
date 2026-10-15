import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Not display:none or visibility:hidden (getClientRects is empty in jsdom, so check styles). */
function isRendered(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // checkVisibility also sees a hidden ancestor (content-visibility, display:none up the tree)
  return el.checkVisibility ? el.checkVisibility() : true;
}

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
      if (!container || !isRendered(container)) return; // nothing to trap in: leave Tab alone
      const current = document.activeElement;

      // Another dialog stacked on top owns focus (for example a modal opened over a sheet): its own
      // trap, not this one, handles Tab
      const owner = current?.closest('[role="dialog"]');
      if (owner && !owner.contains(container) && !container.contains(owner)) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !(el as HTMLButtonElement).disabled && isRendered(el),
      );
      if (focusable.length === 0) {
        e.preventDefault(); // nothing to move to: keep focus where it is rather than leaving the dialog
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Focus on the container itself, on a tabindex=-1 element inside it (the sheet heading) or
      // outside it is not in the tab list: send it to the matching end
      if (!current || !focusable.includes(current as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey) {
        if (current === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last) {
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
        // Focus already moved into another dialog (an overlay replaced this one): leave it there
        if (document.activeElement?.closest('[role="dialog"]')) return;
        if (opener instanceof HTMLElement) opener.focus();
      });
    };
  }, [active, containerRef]);
}

import { useSyncExternalStore } from 'react';

/**
 * Layout class (mobile spec 1.1): Compact < 600px, Medium 600 to 1279px, Expanded >= 1280px.
 * Derived from two matchMedia listeners, never stored, so a live resize or fold/unfold re-renders
 * with the new class and navigation state (kept in the URL) is untouched.
 */
export type LayoutClass = 'compact' | 'medium' | 'expanded';

const MEDIUM_QUERY = '(min-width: 600px)';
const EXPANDED_QUERY = '(min-width: 1280px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function getSnapshot(): LayoutClass {
  // Without matchMedia (SSR, bare test environments) behave like the desktop shell
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'expanded';
  if (matches(EXPANDED_QUERY)) return 'expanded';
  return matches(MEDIUM_QUERY) ? 'medium' : 'compact';
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const lists = [window.matchMedia(MEDIUM_QUERY), window.matchMedia(EXPANDED_QUERY)];
  lists.forEach((l) => l.addEventListener('change', onChange));
  return () => lists.forEach((l) => l.removeEventListener('change', onChange));
}

export function useLayoutClass(): LayoutClass {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'expanded');
}

/**
 * True when the mobile shell applies (everything below xl). Medium shares the Compact shell until
 * the rail and two-pane land in PR8, which flips Medium here and nowhere else.
 */
export function useShell(): boolean {
  return useLayoutClass() !== 'expanded';
}

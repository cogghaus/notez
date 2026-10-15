import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Pure navigation helpers for the mobile shell (spec 3.3). Navigation state lives in the URL and in
 * React Router's `location.state`, so one history serves the browser back button, Android back and
 * the in-app Back arrow:
 *
 *   /                      Notes tab root (depth 0)
 *   /?tab=tasks|search     tab roots (depth 1 from Notes)
 *   /?note=<id>            editor (keeps `tab` when opened from Tasks or Search)
 *   /?view=folders         interim Folders screen (until the filter sheet in PR5)
 *   state.sheet='account'  account bottom sheet, same URL as the screen under it
 *   /settings[/:section]   Settings list and section pages
 *
 * `state.depth` counts entries pushed above the root. It survives a reload (RR keeps the state in
 * history.state.usr), which is what makes Back correct after a reload (N1).
 */

export type Tab = 'notes' | 'tasks' | 'search';
/** Overlays that are history entries. Only one is open at a time; What's New and Share feedback
 *  replace the account sheet's entry, so system back closes just the modal (like Settings). */
export type Sheet = 'account' | 'whats-new' | 'feedback';
const SHEETS: readonly Sheet[] = ['account', 'whats-new', 'feedback'];

const MAX_DEPTH = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION_RE = /^[a-z]+$/;

export type Screen =
  | { kind: 'notes'; tab: 'notes'; noteId: null; section: null }
  | { kind: 'tasks'; tab: 'tasks'; noteId: null; section: null }
  | { kind: 'search'; tab: 'search'; noteId: null; section: null }
  | { kind: 'folders'; tab: 'notes'; noteId: null; section: null }
  | { kind: 'editor'; tab: Tab; noteId: string; section: null }
  | { kind: 'settings-list'; tab: 'notes'; noteId: null; section: null }
  | { kind: 'settings-section'; tab: 'notes'; noteId: null; section: string };

export interface NavState {
  /** Entries pushed above the Notes root. */
  depth: number;
  /** Depth of the current tab's root entry (PR8 pops to it before a tab switch above a pushed screen). */
  tabDepth: number;
  sheet: Sheet | null;
}

function cleanDepth(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_DEPTH) : 0;
}

export function readNavState(state: unknown): NavState {
  const s = (state ?? {}) as { depth?: unknown; tabDepth?: unknown; sheet?: unknown };
  const sheet = SHEETS.find((k) => k === s.sheet) ?? null;
  return { depth: cleanDepth(s.depth), tabDepth: cleanDepth(s.tabDepth), sheet };
}

function tabFrom(raw: string | null): Tab {
  return raw === 'tasks' || raw === 'search' ? raw : 'notes';
}

export function parseScreen(pathname: string, search: string): Screen {
  if (pathname === '/settings' || pathname === '/settings/') {
    return { kind: 'settings-list', tab: 'notes', noteId: null, section: null };
  }
  if (pathname.startsWith('/settings/')) {
    const section = pathname.slice('/settings/'.length);
    // Anything but a plain lowercase word is not a section: show the list
    if (!SECTION_RE.test(section)) return { kind: 'settings-list', tab: 'notes', noteId: null, section: null };
    return { kind: 'settings-section', tab: 'notes', noteId: null, section };
  }
  const params = new URLSearchParams(search);
  const tab = tabFrom(params.get('tab'));
  const noteId = params.get('note');
  if (noteId && UUID_RE.test(noteId)) return { kind: 'editor', tab, noteId, section: null };
  if (params.get('view') === 'folders') return { kind: 'folders', tab: 'notes', noteId: null, section: null };
  if (tab === 'tasks') return { kind: 'tasks', tab, noteId: null, section: null };
  if (tab === 'search') return { kind: 'search', tab, noteId: null, section: null };
  return { kind: 'notes', tab: 'notes', noteId: null, section: null };
}

export function tabUrl(tab: Tab): string {
  return tab === 'notes' ? '/' : `/?tab=${tab}`;
}

export function noteUrl(tab: Tab, noteId: string): string {
  const note = `note=${encodeURIComponent(noteId)}`;
  return tab === 'notes' ? `/?${note}` : `/?tab=${tab}&${note}`;
}

export const FOLDERS_URL = '/?view=folders';

function screenUrl(screen: Screen): string {
  switch (screen.kind) {
    case 'editor':
      return noteUrl(screen.tab, screen.noteId);
    case 'folders':
      return FOLDERS_URL;
    case 'settings-list':
      return '/settings';
    case 'settings-section':
      return `/settings/${screen.section}`;
    default:
      return tabUrl(screen.tab);
  }
}

/**
 * Where in-app Back goes when there is no entry to pop (depth 0 after a reload or a deep link):
 * a replace to the parent screen. Null for the Notes root, which has no Back arrow.
 */
export function parentUrl(screen: Screen, sheet: Sheet | null): string | null {
  if (sheet) return screenUrl(screen);
  switch (screen.kind) {
    case 'editor':
      return tabUrl(screen.tab);
    case 'folders':
    case 'tasks':
    case 'search':
    case 'settings-list':
      return '/';
    case 'settings-section':
      return '/settings';
    default:
      return null;
  }
}

export type TabPlan =
  | { kind: 'none' }
  | { kind: 'push'; url: string; depth: number; tabDepth: number }
  | { kind: 'replace'; url: string; depth: number; tabDepth: number }
  | { kind: 'pop'; count: number };

/** Spec 3.3 push rules for the bottom tab bar. */
export function planTabSwitch(from: Tab, to: Tab, depth: number): TabPlan {
  if (from === to) return { kind: 'none' };
  if (to === 'notes') {
    return depth > 0 ? { kind: 'pop', count: depth } : { kind: 'replace', url: tabUrl('notes'), depth: 0, tabDepth: 0 };
  }
  if (from === 'notes') return { kind: 'push', url: tabUrl(to), depth: depth + 1, tabDepth: depth + 1 };
  return { kind: 'replace', url: tabUrl(to), depth, tabDepth: depth };
}

/** Current navigation read straight from the browser, so handlers never act on a stale render. */
export function readCurrentNav(): { screen: Screen; depth: number; tabDepth: number; sheet: Sheet | null; url: string } {
  const usr = (window.history.state as { usr?: unknown } | null)?.usr;
  const { depth, tabDepth, sheet } = readNavState(usr);
  return {
    screen: parseScreen(window.location.pathname, window.location.search),
    depth,
    tabDepth,
    sheet,
    url: window.location.pathname + window.location.search,
  };
}

/** Router state for a push made from outside the shell hooks (for example the notification bell). */
export function nextNavState(): NavState {
  const cur = readCurrentNav();
  return navState(cur, { depth: cur.depth + 1 });
}

/**
 * Router state for a move made from `cur`, keeping `tabDepth` (and the rest) in step. Used by every
 * push and replace so the state stays complete.
 */
export function navState(cur: { depth: number; tabDepth: number }, over: Partial<NavState> = {}): NavState {
  return { depth: cur.depth, tabDepth: cur.tabDepth, sheet: null, ...over };
}

/**
 * `setSearchParams(..., { replace: true })` that keeps `location.state`. React Router drops the state
 * on that call, which would reset the history depth the shell relies on (Back after a reload).
 */
export function useReplaceSearchParams(): (params: URLSearchParams | Record<string, string>) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const locationRef = useRef(location);
  locationRef.current = location;
  // Stable identity, so effects that call it do not re-run on every navigation
  return useCallback((params) => {
    const search = new URLSearchParams(params).toString();
    navigateRef.current(
      { pathname: locationRef.current.pathname, search: search ? `?${search}` : '' },
      { replace: true, state: locationRef.current.state },
    );
  }, []);
}

// Search tab autofocus: only when the tab was opened by a tap, never at app launch or on reload.
let searchFocusPending = false;
export function requestSearchFocus(): void {
  searchFocusPending = true;
}
export function consumeSearchFocus(): boolean {
  const pending = searchFocusPending;
  searchFocusPending = false;
  return pending;
}

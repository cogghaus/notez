import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FOLDERS_URL,
  navState,
  noteUrl,
  parentUrl,
  parseScreen,
  planTabSwitch,
  readCurrentNav,
  readNavState,
  requestSearchFocus,
  tabUrl,
  type Sheet,
  type Tab,
} from './mobileNav';

/**
 * History-backed navigation for the mobile shell (spec 3.3). All moves go through React Router, so
 * there is one history and system back and the in-app Back arrow run the same popstate path.
 * Actions read the browser's current location and `history.state` when they run, so a handler never
 * acts on a stale render (a click can land before a pending navigation has rendered).
 *
 * `enabled` is false on the Expanded desktop shell, where nothing here applies.
 */
export function useMobileNav(enabled = true) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const screen = useMemo(
    () => parseScreen(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const { depth, sheet } = readNavState(location.state);

  // Guards against a second leave while the first is still resolving (a double tap on Back, or a
  // sidebar click that fires several selection callbacks). Cleared on every location change.
  const leavingRef = useRef(false);
  useEffect(() => {
    leavingRef.current = false;
  }, [location.key]);

  /** In-app Back (N1): pop when there is an entry above the root, else replace with the parent. */
  const back = useCallback(() => {
    const cur = readCurrentNav();
    if (cur.depth > 0) {
      navigateRef.current(-1);
      return;
    }
    const parent = parentUrl(cur.screen, cur.sheet);
    if (parent) navigateRef.current(parent, { replace: true, state: navState(cur, { depth: 0, tabDepth: 0 }) });
  }, []);

  /** Back, at most once per location. Use this for buttons and for callbacks that may fire together. */
  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    back();
  }, [back]);

  const selectTab = useCallback((to: Tab) => {
    const cur = readCurrentNav();
    const plan = planTabSwitch(cur.screen.tab, to, cur.depth);
    if (plan.kind !== 'none' && to === 'search') requestSearchFocus();
    switch (plan.kind) {
      case 'push':
        navigateRef.current(plan.url, { state: navState(cur, { depth: plan.depth, tabDepth: plan.tabDepth }) });
        break;
      case 'replace':
        navigateRef.current(plan.url, {
          replace: true,
          state: navState(cur, { depth: plan.depth, tabDepth: plan.tabDepth }),
        });
        break;
      case 'pop':
        navigateRef.current(-plan.count);
        break;
    }
  }, []);

  const openNote = useCallback((noteId: string) => {
    const cur = readCurrentNav();
    if (cur.screen.kind === 'editor') {
      // Already in the editor: switch note in place, no extra back press
      navigateRef.current(noteUrl(cur.screen.tab, noteId), { replace: true, state: navState(cur, { depth: cur.depth }) });
      return;
    }
    navigateRef.current(noteUrl(cur.screen.tab, noteId), { state: navState(cur, { depth: cur.depth + 1 }) });
  }, []);

  const openFolders = useCallback(() => {
    const cur = readCurrentNav();
    if (cur.screen.kind === 'folders') return;
    navigateRef.current(FOLDERS_URL, { state: navState(cur, { depth: cur.depth + 1 }) });
  }, []);

  /** Leave the Folders screen for a tab (the sidebar's Tasks entry): replaces the Folders entry. */
  const replaceWithTab = useCallback((tab: Tab) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const cur = readCurrentNav();
    navigateRef.current(tabUrl(tab), { replace: true, state: navState(cur, { depth: cur.depth, tabDepth: cur.depth }) });
  }, []);

  /**
   * Open an overlay (account sheet, What's New, Share feedback) as a history entry. From another
   * overlay it replaces that entry, so system back closes just the one on top and returns to the
   * screen under it. Opening the one that is already open does nothing.
   */
  const openSheet = useCallback((kind: Sheet) => {
    const cur = readCurrentNav();
    if (cur.sheet === kind) return;
    if (cur.sheet) {
      navigateRef.current(cur.url, { replace: true, state: navState(cur, { depth: cur.depth, sheet: kind }) });
      return;
    }
    navigateRef.current(cur.url, { state: navState(cur, { depth: cur.depth + 1, sheet: kind }) });
  }, []);
  const openAccount = useCallback(() => openSheet('account'), [openSheet]);

  /** Settings from the account sheet replaces the sheet's entry: Back returns to the tab, not the menu. */
  const openSettings = useCallback(() => {
    const cur = readCurrentNav();
    if (cur.screen.kind === 'settings-list' && !cur.sheet) return;
    navigateRef.current('/settings', {
      replace: cur.sheet !== null,
      state: navState(cur, { depth: cur.sheet ? cur.depth : cur.depth + 1 }),
    });
  }, []);

  const openSettingsSection = useCallback((section: string) => {
    const cur = readCurrentNav();
    if (cur.screen.kind === 'settings-section' && cur.screen.section === section) return;
    navigateRef.current(`/settings/${section}`, { state: navState(cur, { depth: cur.depth + 1 }) });
  }, []);

  // N2: a fresh load of a deep link shows the editor at depth 0 without pushing. On the first user
  // activation (pointerdown or keydown) the entry becomes the list root and the editor is pushed
  // above it, so system back reaches the list instead of leaving the app (Chrome's history
  // intervention skips entries pushed without activation).
  const isBareDeepLink = enabled && screen.kind === 'editor' && location.state == null;
  useEffect(() => {
    if (!isBareDeepLink) return;
    const fire = () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
      const cur = readCurrentNav();
      if (cur.screen.kind !== 'editor') return;
      navigateRef.current(tabUrl(cur.screen.tab), { replace: true, state: navState(cur, { depth: 0, tabDepth: 0 }) });
      navigateRef.current(cur.url, { state: navState(cur, { depth: 1, tabDepth: 0 }) });
    };
    window.addEventListener('pointerdown', fire, true);
    window.addEventListener('keydown', fire, true);
    return () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
  }, [isBareDeepLink, location.key]);

  // Overlays are transient: a reload, or any load that lands on an overlay entry, closes it by
  // popping that entry (the screen under it is the entry below). Only on the first mount and only
  // when that mount is in the shell: a later desktop-to-shell crossing can push a note in the same
  // pass (EditorPage), and the two must never navigate together. A per-mount ref rather than module
  // state keeps tests independent; the check is a no-op unless the current entry is an overlay.
  const bootRef = useRef<'pending' | 'done'>(enabled ? 'pending' : 'done');
  useEffect(() => {
    if (bootRef.current !== 'pending') return;
    bootRef.current = 'done';
    const cur = readCurrentNav();
    if (!cur.sheet) return;
    if (cur.depth > 0) navigateRef.current(-1);
    else navigateRef.current(cur.url, { replace: true, state: navState(cur, { depth: 0, tabDepth: 0 }) });
  }, []);

  return {
    screen,
    tab: screen.tab,
    noteId: screen.kind === 'editor' ? screen.noteId : null,
    foldersOpen: screen.kind === 'folders',
    sheet,
    depth,
    back,
    leave,
    selectTab,
    openNote,
    openFolders,
    replaceWithTab,
    openSheet,
    openAccount,
    openSettings,
    openSettingsSection,
  };
}

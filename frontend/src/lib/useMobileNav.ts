import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FOLDERS_URL,
  noteUrl,
  parentUrl,
  parseScreen,
  planTabSwitch,
  readCurrentNav,
  readNavState,
  tabUrl,
  type Tab,
} from './mobileNav';

// Set once per page load by the first hook that runs (see the boot effect below)
let bootChecked = false;

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

  // Guards against a second leave while the first is still resolving (a sidebar click can fire
  // several selection callbacks in a row). Cleared on every location change.
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
    if (parent) navigateRef.current(parent, { replace: true, state: { depth: 0 } });
  }, []);

  /** Back, at most once per location. For callbacks that may fire together. */
  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    back();
  }, [back]);

  const selectTab = useCallback((to: Tab) => {
    const cur = readCurrentNav();
    const plan = planTabSwitch(cur.screen.tab, to, cur.depth);
    switch (plan.kind) {
      case 'push':
        navigateRef.current(plan.url, { state: { depth: plan.depth } });
        break;
      case 'replace':
        navigateRef.current(plan.url, { replace: true, state: { depth: plan.depth } });
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
      navigateRef.current(noteUrl(cur.screen.tab, noteId), { replace: true, state: { depth: cur.depth } });
      return;
    }
    navigateRef.current(noteUrl(cur.screen.tab, noteId), { state: { depth: cur.depth + 1 } });
  }, []);

  const openFolders = useCallback(() => {
    navigateRef.current(FOLDERS_URL, { state: { depth: readCurrentNav().depth + 1 } });
  }, []);

  /** Leave the Folders screen for a tab (the sidebar's Tasks entry): replaces the Folders entry. */
  const replaceWithTab = useCallback((tab: Tab) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const cur = readCurrentNav();
    navigateRef.current(tabUrl(tab), { replace: true, state: { depth: cur.depth } });
  }, []);

  const openAccount = useCallback(() => {
    const cur = readCurrentNav();
    navigateRef.current(cur.url, { state: { depth: cur.depth + 1, sheet: 'account' } });
  }, []);

  /** Settings from the account sheet replaces the sheet's entry: Back returns to the tab, not the menu. */
  const openSettings = useCallback(() => {
    const cur = readCurrentNav();
    navigateRef.current('/settings', { replace: cur.sheet !== null, state: { depth: cur.sheet ? cur.depth : cur.depth + 1 } });
  }, []);

  const openSettingsSection = useCallback((section: string) => {
    navigateRef.current(`/settings/${section}`, { state: { depth: readCurrentNav().depth + 1 } });
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
      navigateRef.current(tabUrl(cur.screen.tab), { replace: true, state: { depth: 0 } });
      navigateRef.current(cur.url, { state: { depth: 1 } });
    };
    window.addEventListener('pointerdown', fire, true);
    window.addEventListener('keydown', fire, true);
    return () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
  }, [isBareDeepLink, location.key]);

  // The account sheet is a transient overlay: a reload, or any load that lands on a sheet entry,
  // closes it by popping that entry (the screen under it is the entry below). Once per page load.
  useEffect(() => {
    if (!enabled || bootChecked) return;
    bootChecked = true;
    const cur = readCurrentNav();
    if (!cur.sheet) return;
    if (cur.depth > 0) navigateRef.current(-1);
    else navigateRef.current(cur.url, { replace: true, state: { depth: 0 } });
  }, [enabled]);

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
    openAccount,
    openSettings,
    openSettingsSection,
  };
}

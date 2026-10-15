import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { readCurrentNav, useReplaceSearchParams } from './mobileNav';
import { useMobileNav } from './useMobileNav';

/**
 * Runs the real BrowserRouter in jsdom, so these also guard the router internals the shell reads:
 * `navigate(..., { state })` must surface in `history.state.usr` (readCurrentNav).
 */

const NOTE_A = '11111111-1111-4111-8111-111111111111';
const NOTE_B = '22222222-2222-4222-8222-222222222222';

let nav: ReturnType<typeof useMobileNav>;
let navigateFn: ReturnType<typeof useNavigate>;
let replaceParams: ReturnType<typeof useReplaceSearchParams>;

function Probe({ enabled }: { enabled: boolean }) {
  nav = useMobileNav(enabled);
  navigateFn = useNavigate();
  replaceParams = useReplaceSearchParams();
  return null;
}

function mount(enabled = true) {
  return render(
    <BrowserRouter>
      <Probe enabled={enabled} />
    </BrowserRouter>,
  );
}

function resetHistory(url = '/', usr: unknown = { depth: 0 }) {
  window.history.replaceState({ usr, key: 'k0', idx: 0 }, '', url);
}
const idx = () => (window.history.state as { idx: number }).idx;
const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  resetHistory();
});

describe('router internals the shell reads', () => {
  it('navigate state surfaces in history.state (depth, tabDepth)', () => {
    mount();
    act(() => navigateFn('/?tab=tasks', { state: { depth: 2, tabDepth: 1 } }));
    const cur = readCurrentNav();
    expect(cur.depth).toBe(2);
    expect(cur.tabDepth).toBe(1);
    expect(cur.screen.kind).toBe('tasks');
  });

  it('useReplaceSearchParams keeps the state that setSearchParams would drop', () => {
    mount();
    act(() => navigateFn('/settings/profile?x=1', { state: { depth: 2 } }));
    act(() => replaceParams({}));
    expect(window.location.search).toBe('');
    expect(readCurrentNav().depth).toBe(2);
  });
});

describe('useMobileNav history rules', () => {
  it('tab pushes record tabDepth; Tasks to Search replaces', () => {
    mount();
    act(() => nav.selectTab('tasks'));
    expect(readCurrentNav()).toMatchObject({ depth: 1, tabDepth: 1 });
    const i = idx();
    act(() => nav.selectTab('search'));
    expect(idx()).toBe(i);
    expect(window.location.search).toBe('?tab=search');
    expect(readCurrentNav()).toMatchObject({ depth: 1, tabDepth: 1 });
  });

  it('opening a note carries tabDepth; opening another note while in the editor replaces', () => {
    mount();
    act(() => nav.selectTab('tasks'));
    act(() => nav.openNote(NOTE_A));
    expect(readCurrentNav()).toMatchObject({ depth: 2, tabDepth: 1 });
    const i = idx();
    act(() => nav.openNote(NOTE_B));
    expect(idx()).toBe(i);
    expect(window.location.search).toContain(NOTE_B);
    expect(readCurrentNav().depth).toBe(2);
  });

  it('replaceWithTab swaps the Folders entry for the tab at the same depth', () => {
    mount();
    act(() => nav.openFolders());
    const i = idx();
    expect(readCurrentNav().screen.kind).toBe('folders');
    act(() => nav.replaceWithTab('tasks'));
    expect(idx()).toBe(i);
    expect(readCurrentNav().screen.kind).toBe('tasks');
    expect(readCurrentNav().depth).toBe(1);
  });

  it('openFolders, openAccount and openSettingsSection are idempotent', () => {
    mount();
    act(() => nav.openFolders());
    const i = idx();
    act(() => nav.openFolders());
    expect(idx()).toBe(i);

    resetHistory();
    act(() => navigateFn('/', { replace: true, state: { depth: 0 } }));
    act(() => nav.openAccount());
    const j = idx();
    act(() => nav.openAccount());
    expect(idx()).toBe(j);
    expect(readCurrentNav().sheet).toBe('account');
  });

  it('a second overlay replaces the first entry (What\'s New from the account sheet)', () => {
    mount();
    act(() => nav.openAccount());
    const i = idx();
    act(() => nav.openSheet('whats-new'));
    expect(idx()).toBe(i);
    expect(readCurrentNav()).toMatchObject({ sheet: 'whats-new', depth: 1 });
  });

  it('leave pops once even when called twice before the navigation lands', async () => {
    mount();
    act(() => nav.selectTab('tasks'));
    act(() => nav.openNote(NOTE_A));
    const i = idx();
    act(() => {
      nav.leave();
      nav.leave();
    });
    await waitFor(() => expect(readCurrentNav().screen.kind).toBe('tasks'));
    await settle();
    expect(idx()).toBe(i - 1);
  });
});

describe('overlay boot check', () => {
  function landOnSheet() {
    window.history.replaceState({ usr: { depth: 0 }, key: 'a', idx: 0 }, '', '/');
    window.history.pushState({ usr: { depth: 1, tabDepth: 0, sheet: 'account' }, key: 'b', idx: 1 }, '', '/');
  }

  it('closes an overlay entry found on the first mount in the shell', async () => {
    landOnSheet();
    mount(true);
    await waitFor(() => expect(readCurrentNav().sheet).toBeNull());
    expect(idx()).toBe(0);
  });

  it('does not touch the history when the first mount is not in the shell', async () => {
    landOnSheet();
    const view = mount(false);
    view.rerender(
      <BrowserRouter>
        <Probe enabled={true} />
      </BrowserRouter>,
    );
    await settle();
    expect(readCurrentNav().sheet).toBe('account');
    expect(idx()).toBe(1);
  });
});

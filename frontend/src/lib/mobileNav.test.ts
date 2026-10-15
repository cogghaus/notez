import { describe, it, expect } from 'vitest';
import {
  parseScreen,
  parentUrl,
  planTabSwitch,
  tabUrl,
  noteUrl,
  readNavState,
} from './mobileNav';

describe('readNavState', () => {
  it('reads depth and sheet from router state', () => {
    expect(readNavState({ depth: 2, tabDepth: 1, sheet: 'account' })).toEqual({ depth: 2, tabDepth: 1, sheet: 'account' });
    expect(readNavState({ depth: 1, sheet: 'whats-new' }).sheet).toBe('whats-new');
    expect(readNavState({ depth: 1, sheet: 'feedback' }).sheet).toBe('feedback');
  });
  it('rejects unknown sheets and caps the depth', () => {
    expect(readNavState({ depth: 1, sheet: 'bogus' }).sheet).toBeNull();
    expect(readNavState({ depth: 1, sheet: { x: 1 } }).sheet).toBeNull();
    expect(readNavState({ depth: 9999 }).depth).toBe(50);
    expect(readNavState({ depth: 3, tabDepth: 9999 }).tabDepth).toBe(50);
    expect(readNavState({ depth: 3, tabDepth: -1 }).tabDepth).toBe(0);
  });
  it('treats missing or malformed state as depth 0', () => {
    expect(readNavState(null)).toEqual({ depth: 0, tabDepth: 0, sheet: null });
    expect(readNavState(undefined)).toEqual({ depth: 0, tabDepth: 0, sheet: null });
    expect(readNavState({ depth: 'x' })).toEqual({ depth: 0, tabDepth: 0, sheet: null });
    expect(readNavState({ depth: -3 })).toEqual({ depth: 0, tabDepth: 0, sheet: null });
  });
});

describe('parseScreen', () => {
  it('maps URLs to screens', () => {
    expect(parseScreen('/', '')).toMatchObject({ kind: 'notes', tab: 'notes' });
    expect(parseScreen('/', '?tab=tasks')).toMatchObject({ kind: 'tasks', tab: 'tasks' });
    expect(parseScreen('/', '?tab=search')).toMatchObject({ kind: 'search', tab: 'search' });
    expect(parseScreen('/', '?view=folders')).toMatchObject({ kind: 'folders', tab: 'notes' });
    expect(parseScreen('/', '?note=11111111-1111-4111-8111-111111111111')).toMatchObject({ kind: 'editor', noteId: '11111111-1111-4111-8111-111111111111', tab: 'notes' });
    expect(parseScreen('/', '?tab=search&note=11111111-1111-4111-8111-111111111111')).toMatchObject({ kind: 'editor', noteId: '11111111-1111-4111-8111-111111111111', tab: 'search' });
    expect(parseScreen('/settings', '')).toMatchObject({ kind: 'settings-list' });
    expect(parseScreen('/settings/profile', '')).toMatchObject({ kind: 'settings-section', section: 'profile' });
  });
  it('accepts ?note= only when it is a uuid', () => {
    expect(parseScreen('/', '?note=abc').kind).toBe('notes');
    expect(parseScreen('/', '?tab=search&note=..%2F..').kind).toBe('search');
    expect(parseScreen('/', '?note=' + '11111111-1111-4111-8111-111111111111').kind).toBe('editor');
  });
  it('restricts the settings section to lowercase letters', () => {
    expect(parseScreen('/settings/profile', '').kind).toBe('settings-section');
    expect(parseScreen('/settings/Pro%20file', '').kind).toBe('settings-list');
    expect(parseScreen('/settings/a/b', '').kind).toBe('settings-list');
  });
  it('ignores an unknown tab', () => {
    expect(parseScreen('/', '?tab=bogus')).toMatchObject({ kind: 'notes', tab: 'notes' });
  });
  it('lets the note win over the folders view', () => {
    expect(parseScreen('/', '?view=folders&note=11111111-1111-4111-8111-111111111111').kind).toBe('editor');
  });
});

describe('urls', () => {
  it('builds tab urls', () => {
    expect(tabUrl('notes')).toBe('/');
    expect(tabUrl('tasks')).toBe('/?tab=tasks');
    expect(tabUrl('search')).toBe('/?tab=search');
  });
  it('builds note urls that remember the tab', () => {
    expect(noteUrl('notes', 'n1')).toBe('/?note=n1');
    expect(noteUrl('search', 'n1')).toBe('/?tab=search&note=n1');
    expect(noteUrl('tasks', 'n 1')).toBe('/?tab=tasks&note=n%201');
  });
});

describe('planTabSwitch', () => {
  it('pushes one tab entry from the Notes root', () => {
    expect(planTabSwitch('notes', 'tasks', 0)).toEqual({ kind: 'push', url: '/?tab=tasks', depth: 1, tabDepth: 1 });
    expect(planTabSwitch('notes', 'search', 0)).toEqual({ kind: 'push', url: '/?tab=search', depth: 1, tabDepth: 1 });
  });
  it('replaces when switching between Tasks and Search', () => {
    expect(planTabSwitch('tasks', 'search', 1)).toEqual({ kind: 'replace', url: '/?tab=search', depth: 1, tabDepth: 1 });
    expect(planTabSwitch('search', 'tasks', 1)).toEqual({ kind: 'replace', url: '/?tab=tasks', depth: 1, tabDepth: 1 });
  });
  it('pops back to the root when tapping Notes from a pushed tab', () => {
    expect(planTabSwitch('tasks', 'notes', 1)).toEqual({ kind: 'pop', count: 1 });
  });
  it('replaces with the Notes root when there is nothing to pop (after a fresh load)', () => {
    expect(planTabSwitch('tasks', 'notes', 0)).toEqual({ kind: 'replace', url: '/', depth: 0, tabDepth: 0 });
  });
  it('does nothing when the tab is already current', () => {
    expect(planTabSwitch('notes', 'notes', 0)).toEqual({ kind: 'none' });
    expect(planTabSwitch('tasks', 'tasks', 1)).toEqual({ kind: 'none' });
  });
});

describe('parentUrl (in-app Back at depth 0, N1)', () => {
  const at = (path: string, search = '', sheet: 'account' | null = null) => parentUrl(parseScreen(path, search), sheet);

  it('editor goes to its tab list', () => {
    expect(at('/', '?note=11111111-1111-4111-8111-111111111111')).toBe('/');
    expect(at('/', '?tab=search&note=11111111-1111-4111-8111-111111111111')).toBe('/?tab=search');
    expect(at('/', '?tab=tasks&note=11111111-1111-4111-8111-111111111111')).toBe('/?tab=tasks');
  });
  it('folders view goes to the Notes root', () => {
    expect(at('/', '?view=folders')).toBe('/');
  });
  it('Tasks and Search roots go to the Notes root', () => {
    expect(at('/', '?tab=tasks')).toBe('/');
    expect(at('/', '?tab=search')).toBe('/');
  });
  it('settings section goes to the list, the list to the app', () => {
    expect(at('/settings/profile')).toBe('/settings');
    expect(at('/settings')).toBe('/');
  });
  it('a sheet goes to its own screen without the sheet', () => {
    expect(at('/', '?tab=tasks', 'account')).toBe('/?tab=tasks');
    expect(at('/', '', 'account')).toBe('/');
  });
  it('the Notes root has no parent', () => {
    expect(at('/')).toBeNull();
  });
});

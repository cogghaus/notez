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
    expect(readNavState({ depth: 2, sheet: 'account' })).toEqual({ depth: 2, sheet: 'account' });
  });
  it('treats missing or malformed state as depth 0', () => {
    expect(readNavState(null)).toEqual({ depth: 0, sheet: null });
    expect(readNavState(undefined)).toEqual({ depth: 0, sheet: null });
    expect(readNavState({ depth: 'x' })).toEqual({ depth: 0, sheet: null });
    expect(readNavState({ depth: -3 })).toEqual({ depth: 0, sheet: null });
  });
});

describe('parseScreen', () => {
  it('maps URLs to screens', () => {
    expect(parseScreen('/', '')).toMatchObject({ kind: 'notes', tab: 'notes' });
    expect(parseScreen('/', '?tab=tasks')).toMatchObject({ kind: 'tasks', tab: 'tasks' });
    expect(parseScreen('/', '?tab=search')).toMatchObject({ kind: 'search', tab: 'search' });
    expect(parseScreen('/', '?view=folders')).toMatchObject({ kind: 'folders', tab: 'notes' });
    expect(parseScreen('/', '?note=abc')).toMatchObject({ kind: 'editor', noteId: 'abc', tab: 'notes' });
    expect(parseScreen('/', '?tab=search&note=abc')).toMatchObject({ kind: 'editor', noteId: 'abc', tab: 'search' });
    expect(parseScreen('/settings', '')).toMatchObject({ kind: 'settings-list' });
    expect(parseScreen('/settings/profile', '')).toMatchObject({ kind: 'settings-section', section: 'profile' });
  });
  it('ignores an unknown tab', () => {
    expect(parseScreen('/', '?tab=bogus')).toMatchObject({ kind: 'notes', tab: 'notes' });
  });
  it('lets the note win over the folders view', () => {
    expect(parseScreen('/', '?view=folders&note=abc').kind).toBe('editor');
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
    expect(planTabSwitch('notes', 'tasks', 0)).toEqual({ kind: 'push', url: '/?tab=tasks', depth: 1 });
    expect(planTabSwitch('notes', 'search', 0)).toEqual({ kind: 'push', url: '/?tab=search', depth: 1 });
  });
  it('replaces when switching between Tasks and Search', () => {
    expect(planTabSwitch('tasks', 'search', 1)).toEqual({ kind: 'replace', url: '/?tab=search', depth: 1 });
    expect(planTabSwitch('search', 'tasks', 1)).toEqual({ kind: 'replace', url: '/?tab=tasks', depth: 1 });
  });
  it('pops back to the root when tapping Notes from a pushed tab', () => {
    expect(planTabSwitch('tasks', 'notes', 1)).toEqual({ kind: 'pop', count: 1 });
  });
  it('replaces with the Notes root when there is nothing to pop (after a fresh load)', () => {
    expect(planTabSwitch('tasks', 'notes', 0)).toEqual({ kind: 'replace', url: '/', depth: 0 });
  });
  it('does nothing when the tab is already current', () => {
    expect(planTabSwitch('notes', 'notes', 0)).toEqual({ kind: 'none' });
    expect(planTabSwitch('tasks', 'tasks', 1)).toEqual({ kind: 'none' });
  });
});

describe('parentUrl (in-app Back at depth 0, N1)', () => {
  const at = (path: string, search = '', sheet: 'account' | null = null) => parentUrl(parseScreen(path, search), sheet);

  it('editor goes to its tab list', () => {
    expect(at('/', '?note=a')).toBe('/');
    expect(at('/', '?tab=search&note=a')).toBe('/?tab=search');
    expect(at('/', '?tab=tasks&note=a')).toBe('/?tab=tasks');
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

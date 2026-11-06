import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installMockApi, NOTE } from './support/mockApi';

/**
 * Accessibility gates for the mobile shell (spec 9.7, from PR3 on):
 * 1. axe-core at 360x800, 411x693 and 841x627, light and dark, on every shell state: zero serious
 *    or critical violations.
 * 3. 200% text at 360px: no horizontal overflow, no clipped text.
 * 4. Keyboard only at Medium (841x627): the shell is reachable by Tab, focus is visible, Escape
 *    closes the account sheet.
 * Viewports are set per test, so these run once (s23u project) rather than per device.
 */

const SIZES = [
  { w: 360, h: 800 },
  { w: 411, h: 693 },
  { w: 841, h: 627 },
];

type State = { name: string; open: (page: Page) => Promise<void> };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const STATES: State[] = [
  { name: 'notes', open: async (page) => { await expect(page.getByRole('button', { name: /fairly long title/ }).first()).toBeVisible(); } },
  { name: 'tasks', open: async (page) => { await nav(page).getByRole('button', { name: 'Tasks' }).click(); await expect(page.getByText('Pick up the dry cleaning')).toBeVisible(); } },
  {
    name: 'search results',
    open: async (page) => {
      await nav(page).getByRole('button', { name: 'Search' }).click();
      await page.getByRole('searchbox', { name: 'Search notes' }).fill('milk');
      await expect(page.getByRole('button', { name: new RegExp(NOTE.title) })).toBeVisible();
    },
  },
  { name: 'editor', open: async (page) => { await page.getByRole('button', { name: /fairly long title/ }).first().click(); await expect(page.locator('[data-note-editor]')).toBeVisible(); } },
  {
    name: "what's new",
    open: async (page) => {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('dialog', { name: 'tester' }).getByRole('button', { name: "What's New" }).click();
      await expect(page.getByRole('dialog', { name: /What's New in Notez/ })).toBeVisible();
    },
  },
  {
    name: 'feedback',
    open: async (page) => {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('dialog', { name: 'tester' }).getByRole('button', { name: 'Share feedback' }).click();
      await expect(page.getByRole('dialog', { name: 'Share Your Feedback' })).toBeVisible();
    },
  },
  { name: 'account sheet', open: async (page) => { await page.getByRole('button', { name: 'Account menu' }).click(); await expect(page.getByRole('dialog', { name: 'tester' })).toBeVisible(); } },
  { name: 'folders view', open: async (page) => { await page.getByRole('button', { name: /All notes/ }).click(); await expect(page.getByRole('button', { name: /^Work/ }).first()).toBeVisible(); } },
  {
    name: 'settings list',
    open: async (page) => {
      await page.goto('/settings', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    },
  },
  {
    name: 'settings profile',
    open: async (page) => {
      await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    },
  },
];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 's23u', 'viewports are set per test');
  await installMockApi(page);
});

for (const theme of ['light', 'dark'] as const) {
  for (const { w, h } of SIZES) {
    test(`axe: no serious or critical violations, ${theme}, ${w}x${h}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.setViewportSize({ width: w, height: h });
      const failures: string[] = [];
      for (const state of STATES) {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await state.open(page);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        for (const v of results.violations) {
          if (v.impact !== 'serious' && v.impact !== 'critical') continue;
          const where = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ');
          failures.push(`[${state.name}] ${v.id} (${v.impact}, ${v.nodes.length}): ${where}`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
}

test('200% text at 360px: no horizontal overflow, no clipped text', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const failures: string[] = [];
  for (const state of STATES) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await state.open(page);
    const report = await page.evaluate(() => {
      const root = document.getElementById('root') as HTMLElement;
      const clipped: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (cs.overflowY !== 'hidden' || cs.webkitLineClamp !== 'none') continue;
        if (!el.textContent?.trim() || el.getBoundingClientRect().height === 0) continue;
        // Visually hidden on purpose (sr-only: a 1px box clipped to nothing), read by screen readers
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1 || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
        if (el.scrollHeight > el.clientHeight + 1) clipped.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}"`);
      }
      return { overflow: root.scrollWidth > root.clientWidth + 1, rootW: root.scrollWidth, vw: root.clientWidth, clipped: clipped.slice(0, 5) };
    });
    if (report.overflow) failures.push(`[${state.name}] horizontal overflow ${report.rootW} > ${report.vw}`);
    for (const c of report.clipped) failures.push(`[${state.name}] clipped ${c}`);
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('keyboard only at 841x627: shell reachable, focus visible, Escape closes the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 841, height: 627 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /fairly long title/ }).first()).toBeVisible();

  const reached = new Set<string>();
  let invisibleFocus = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none';
      return { name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', visible };
    });
    if (!info) continue;
    reached.add(info.name);
    if (!info.visible) invisibleFocus++;
  }
  for (const name of ['Account menu', 'Notes', 'Tasks', 'Search']) {
    expect([...reached].some((r) => r.startsWith(name)), `Tab reaches ${name}`).toBe(true);
  }
  expect(invisibleFocus, 'focused controls without a visible indicator').toBe(0);

  const opener = page.getByRole('button', { name: 'Account menu' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeHidden();
  await expect(opener).toBeFocused();
});

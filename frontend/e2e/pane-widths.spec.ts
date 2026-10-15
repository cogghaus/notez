import { test, expect, type Page } from '@playwright/test';
import { installMockApi } from './support/mockApi';

/**
 * Pane widths and Settings on phones (mobile rework PR2, audit 2.1 to 2.3).
 *
 * Below xl every pane is a single full-width view: the desktop inline widths (sidebar 256px,
 * list 320px) must not apply, the editor must not overflow, and Settings must have a visible main.
 * The optional desktop project (E2E_DESKTOP=1) checks that the desktop widths are unchanged.
 */

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

const isDesktop = (name: string) => name === 'desktop';

/** Widths of the visible children of the main content row ([data-kb-pad]). */
async function visiblePaneWidths(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-kb-pad]') as HTMLElement;
    return Array.from(row.children)
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => Math.round(el.getBoundingClientRect().width));
  });
}

async function viewportWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth);
}

/** Elements inside `root` whose content is wider than their box, or that stick out of the viewport. */
async function overflowReport(page: Page, rootSelector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) as HTMLElement;
    const vw = document.documentElement.clientWidth;
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute('title') ? `[title="${el.getAttribute('title')}"]` : ''}` +
      `.${(el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.')}`;
    const overflowingRows: string[] = [];
    const offscreen: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const h = el as HTMLElement;
      // Rows only: flex containers that are not themselves scrollers (the note body scrolls on purpose).
      if (cs.display.includes('flex') && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        if (h.scrollWidth > h.clientWidth + 1) overflowingRows.push(`${describe(el)} ${h.scrollWidth}>${h.clientWidth}`);
      }
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1) offscreen.push(`${describe(el)} right=${Math.round(r.right)}`);
      }
    }
    return {
      vw,
      rootWidth: Math.round(root.getBoundingClientRect().width),
      docScrollWidth: document.documentElement.scrollWidth,
      overflowingRows,
      offscreen,
    };
  }, rootSelector);
}

test('notes list fills the viewport width', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /fairly long title/ }).first()).toBeVisible();

  const widths = await visiblePaneWidths(page);
  if (isDesktop(testInfo.project.name)) {
    // Desktop unchanged: sidebar 256 + list 320 (defaults) + editor fills the rest.
    expect(widths.slice(0, 1), 'desktop sidebar width').toEqual([256]);
    expect(widths, 'desktop list width').toContain(320);
    return;
  }
  const vw = await viewportWidth(page);
  expect(widths, `one full-width pane at ${vw}px`).toEqual([vw]);
});

test('note previews show plain text, not HTML', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const row = page.getByRole('button', { name: /fairly long title/ }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Shopping Buy milk and eggs before the weekend.');
  await expect(row).not.toContainText('<');
});

test('folders pane fills the viewport width', async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), 'folders are always visible on desktop');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-mobile-bottom-nav]').getByRole('button', { name: 'Folders' }).click();
  await expect(page.getByText('Work').first()).toBeVisible();

  const vw = await viewportWidth(page);
  expect(await visiblePaneWidths(page), `one full-width pane at ${vw}px`).toEqual([vw]);
});

test('tasks pane fills the viewport width', async ({ page }, testInfo) => {
  test.skip(isDesktop(testInfo.project.name), 'mobile bottom nav only');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-mobile-bottom-nav]').getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByText('Pick up the dry cleaning')).toBeVisible();

  const vw = await viewportWidth(page);
  expect(await visiblePaneWidths(page), `one full-width pane at ${vw}px`).toEqual([vw]);
});

test('editor pane matches the viewport and its header rows do not overflow', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /fairly long title/ }).first().click();
  await expect(page.locator('[data-note-editor]')).toBeVisible();
  await expect(page.getByTitle('Move to trash')).toBeVisible();

  const report = await overflowReport(page, '[data-note-editor]');
  if (!isDesktop(testInfo.project.name)) {
    expect.soft(await visiblePaneWidths(page), 'editor is the only pane').toEqual([report.vw]);
    expect.soft(report.rootWidth, 'editor width equals viewport').toBe(report.vw);
  }
  expect.soft(report.docScrollWidth, 'no horizontal page scroll').toBeLessThanOrEqual(report.vw);
  expect.soft(report.overflowingRows, 'header rows overflow').toEqual([]);
  expect.soft(report.offscreen, 'controls past the right edge').toEqual([]);
});

test('settings main is visible and shows the Profile section', async ({ page }) => {
  await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Profile', level: 1 })).toBeAttached();

  const vw = await viewportWidth(page);
  const box = await main.boundingBox();
  expect(box?.width ?? 0, 'settings main width').toBeGreaterThan(Math.min(vw - 1, 600) * 0.9);
  await expect(main.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await expect(main.getByText('Account Information')).toBeVisible();
});

test('note search and tag inputs follow dark mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/dark/);

  const search = page.getByPlaceholder('Search notes...');
  await expect(search).toBeVisible();
  await page.getByRole('button', { name: /fairly long title/ }).first().click();
  const tagInput = page.locator('#tag-input');
  await expect(tagInput).toBeVisible();

  const colours = await page.evaluate(() => {
    const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : 'missing');
    const searchEl = document.querySelector('input[placeholder="Search notes..."]');
    const tagEl = document.getElementById('tag-input');
    return {
      search: bg(searchEl),
      searchText: searchEl ? getComputedStyle(searchEl).color : 'missing',
      tagBox: bg(tagEl?.closest('.flex-wrap') ?? null),
      tagText: tagEl ? getComputedStyle(tagEl).color : 'missing',
    };
  });
  const WHITE = 'rgb(255, 255, 255)';
  const GRAY_700 = 'rgb(55, 65, 81)';
  expect.soft(colours.search, 'search input background').toBe(GRAY_700);
  expect.soft(colours.searchText, 'search input text').toBe(WHITE);
  expect.soft(colours.tagBox, 'tag input background').toBe(GRAY_700);
  expect.soft(colours.tagText, 'tag input text').toBe(WHITE);
});

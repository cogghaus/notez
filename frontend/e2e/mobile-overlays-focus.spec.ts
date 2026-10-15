import { test, expect, type Page } from '@playwright/test';
import { installMockApi, makeNotes, NOTE } from './support/mockApi';

/**
 * Overlays, focus and search behaviour of the mobile shell (PR3 review round 1): What's New and
 * Share feedback are history entries of their own (never a modal inside the sheet), focus never
 * falls to <body>, the Search tab announces its state, and a Search-opened note is a normal note.
 */

const NOTES = makeNotes(5);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile shell only');
  await installMockApi(page, { 'GET /api/notes': { notes: NOTES, total: NOTES.length } });
  await page.route(/\/api\/notes\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const note = NOTES.find((n) => n.id === id) ?? NOTE;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ note }) });
  });
});

const accountButton = (page: Page) => page.getByRole('button', { name: 'Account menu' });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'tester' });
const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

async function openFromSheet(page: Page, row: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await accountButton(page).click();
  await sheet(page).getByRole('button', { name: row }).click();
}

const OVERLAYS = [
  { row: "What's New", dialog: /What's New in Notez/ },
  { row: 'Share feedback', dialog: 'Share Your Feedback' },
] as const;

for (const { row, dialog } of OVERLAYS) {
  test(`${row} replaces the sheet, Tab reaches Close, Escape closes and focus returns to Account menu`, async ({ page }) => {
    await openFromSheet(page, row);
    const modal = page.getByRole('dialog', { name: dialog });
    await expect(modal).toBeVisible();
    // Never a modal inside the sheet: the sheet is gone while the modal is up
    await expect(sheet(page)).toBeHidden();

    const close = modal.getByRole('button', { name: 'Close', exact: true });
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await close.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab reaches Close').toBe(true);

    // Shift+Tab from the first control wraps inside the dialog
    await page.keyboard.press('Shift+Tab');
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(sheet(page)).toBeHidden();
    await expect(accountButton(page)).toBeFocused();
  });
}

test('system back with Share feedback open closes only the modal', async ({ page }) => {
  await openFromSheet(page, 'Share feedback');
  await expect(page.getByRole('dialog', { name: 'Share Your Feedback' })).toBeVisible();
  const url = page.url();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Share Your Feedback' })).toBeHidden();
  await expect(sheet(page)).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('button', { name: /Filter notes/ })).toBeVisible();
  await expect(accountButton(page)).toBeFocused();
});

test('a double tap on Back pops one entry only', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('dialog', { name: 'tester' }).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await back.evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  // One pop lands on the Tasks tab; a second would have left it for the Notes root
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(300);
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
});

test('focus returns to the Notes title after a pick on the Folders screen', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  await page.getByRole('button', { name: /^Work/ }).first().click();
  const title = page.getByRole('button', { name: /Filter notes, currently Work/ });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
});

test('the Folders screen has no collapse button', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  await expect(page.getByRole('button', { name: /^Work/ }).first()).toBeVisible();
  await expect(page.getByTitle('Collapse sidebar')).toHaveCount(0);
});

test('Folders -> sidebar Tasks swaps the entry; Back then reaches the Notes root', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  await page.getByRole('button', { name: /^Tasks/ }).first().click();
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Pick up the dry cleaning')).toBeVisible();
  await page.goBack();
  await expect(primaryNav(page).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: /Filter notes/ })).toBeVisible();
});

test('a folder picked on the Folders screen is named in the Tasks title', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  await page.getByRole('button', { name: /^Work/ }).first().click();
  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks, Work', level: 1 })).toBeVisible();
});

test('moving a note to trash puts focus on the next row', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Filler note 2/ }).click();
  await expect(page.locator('[data-note-editor]')).toBeVisible();
  await page.getByTitle('Move to trash').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.locator('[data-note-editor]')).toBeHidden();
  await expect(page.getByRole('button', { name: /Filler note 3/ })).toBeFocused();
  await expect(page.getByRole('button', { name: /Filler note 2/ })).toHaveCount(0);
});

test('trashing the last note focuses the previous row', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Filler note 4/ }).click();
  await page.getByTitle('Move to trash').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.getByRole('button', { name: /Filler note 3/ })).toBeFocused();
});

test.describe('Search tab', () => {
  const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' });
  const status = (page: Page) => page.locator('[role="status"]');

  test('announces progress and outcome in one live region and never flashes "Nothing found"', async ({ page }) => {
    await page.route('**/api/search*', async (route) => {
      const q = new URL(route.request().url()).searchParams.get('q');
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: q === 'zzz' ? [] : [{ id: NOTE.id, title: NOTE.title, snippet: 'Buy milk', folder: null, tags: [] }], total: 1 }),
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await expect(searchBox(page)).toBeVisible();
    await expect(page.locator('[role="status"]'), 'one live region').toHaveCount(1);

    await searchBox(page).fill('milk');
    await expect(status(page)).toHaveText('Searching');
    await expect(page.getByText(/Nothing found/)).toHaveCount(0);
    await expect(status(page)).toHaveText('1 note found');

    await searchBox(page).fill('zzz');
    await expect(status(page)).toHaveText('Searching');
    await expect(page.getByText(/Nothing found/)).toHaveCount(0);
    await expect(status(page)).toHaveText("Nothing found for 'zzz'");
    await expect(page.getByText('Try fewer or different words.')).toBeVisible();
  });

  test('a failed search offers Retry', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/search*', async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: NOTE.id, title: NOTE.title, snippet: '', folder: null, tags: [] }], total: 1 }),
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await searchBox(page).fill('milk');
    await expect(status(page)).toHaveText('Search failed');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('button', { name: new RegExp(NOTE.title) })).toBeVisible();
  });

  test('removing a recent search moves focus to the next row, then the search box', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('notez-recent-searches', JSON.stringify(['alpha', 'beta'])));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Remove alpha from recent searches' }).click();
    await expect(page.getByRole('button', { name: 'Remove beta from recent searches' })).toBeFocused();
    await page.getByRole('button', { name: 'Remove beta from recent searches' }).click();
    await expect(searchBox(page)).toBeFocused();
  });

  test('Clear all moves focus to the search box', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('notez-recent-searches', JSON.stringify(['alpha', 'beta'])));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(searchBox(page)).toBeFocused();
  });

  test('Back from a note opened in Search restores the results and focuses the result', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await searchBox(page).fill('milk');
    const result = page.getByRole('button', { name: new RegExp(NOTE.title) });
    await result.click();
    await expect(page.locator('[data-note-editor]')).toBeVisible();
    await page.goBack();
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
    await expect(searchBox(page)).toHaveValue('milk');
  });
});

test('a note opened from Search is never in service account mode and always has Back', async ({ page }) => {
  // Notes filter on service accounts, then the same note opened through the Search tab
  await page.goto(`/?tab=search&note=${NOTE.id}&folder=service-accounts`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-note-editor]')).toBeVisible();
  await expect(page.getByTitle('Move to trash')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
});

// ---- Round 2 ----

const scrollTopOf = (page: Page, key: string) =>
  page.locator(`[data-scroll-key="${key}"]`).evaluate((el) => el.scrollTop);

test('Folders footer What\'s New is a history entry: back closes it, Tab still moves, it does not return', async ({ page }) => {
  await page.setViewportSize({ width: 841, height: 627 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  const version = page.getByRole('button', { name: /What's New, version/ });
  await version.click();
  const modal = page.getByRole('dialog', { name: /What's New in Notez/ });
  await expect(modal).toBeVisible();

  await page.goBack();
  await expect(modal).toBeHidden();
  await expect(version).toBeFocused();
  // Not trapped by a stale dialog: focus moves on (the footer is the last control, so go backwards)
  await page.keyboard.press('Shift+Tab');
  await expect(version).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  // Leave and reopen Folders: What's New is not showing again
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /All notes/ }).click();
  await expect(page.getByRole('button', { name: /^Work/ }).first()).toBeVisible();
  await expect(modal).toBeHidden();
});

test('the Folders version button says it opens What\'s New', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /All notes/ }).click();
  await expect(page.getByRole('button', { name: /^What's New, version \d/ })).toBeVisible();
});

test('Previous Releases in What\'s New is a disclosure with its state exposed', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('dialog', { name: 'tester' }).getByRole('button', { name: "What's New" }).click();
  const toggle = page.getByRole('button', { name: /Previous Releases/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const controls = await toggle.getAttribute('aria-controls');
  expect(controls, 'aria-controls names the release list').toBeTruthy();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`[id="${controls}"]`)).toBeVisible();
});

test('Search starts at the top for a new query after leaving the tab', async ({ page }) => {
  const results = Array.from({ length: 40 }, (_, i) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    title: `Hit ${i}`,
    snippet: '',
    folder: null,
    tags: [],
  }));
  await page.route('**/api/search*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, total: results.length }) }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Search' }).click();
  const box = page.getByRole('searchbox', { name: 'Search notes' });
  await box.fill('x1');
  await page.getByRole('button', { name: /Hit 30/ }).scrollIntoViewIfNeeded();
  expect(await scrollTopOf(page, 'search')).toBeGreaterThan(0);

  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await primaryNav(page).getByRole('button', { name: 'Search' }).click();
  await box.fill('x2');
  await expect(page.getByRole('button', { name: /Hit 0/ })).toBeVisible();
  await page.waitForTimeout(400);
  expect(await scrollTopOf(page, 'search')).toBe(0);
});

test('system back during the Feedback thanks screen does not go back twice', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await accountButton(page).click();
  await sheet(page).getByRole('button', { name: 'Share feedback' }).click();
  await page.getByLabel('What would help?').fill('Dark mode scheduling');
  await page.getByLabel('Describe your idea').fill('Switch themes at sunset');
  await page.getByRole('button', { name: 'Send Feedback' }).click();

  const thanks = page.getByRole('heading', { name: 'Thanks for your feedback!' });
  await expect(thanks).toBeVisible();
  // Focus moved to the thanks heading, and it names the dialog
  await expect(thanks).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Thanks for your feedback!' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Thanks for your feedback!' })).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
});

test('closing Feedback with Escape keeps the draft; it clears after a send', async ({ page }) => {
  await openFromSheet(page, 'Share feedback');
  await page.getByLabel('What would help?').fill('Keep me');
  await page.keyboard.press('Escape');
  await accountButton(page).click();
  await sheet(page).getByRole('button', { name: 'Share feedback' }).click();
  await expect(page.getByLabel('What would help?')).toHaveValue('Keep me');
  await expect(page.getByRole('button', { name: 'Suggest Something' })).toHaveAttribute('aria-pressed', 'true');

  // A successful send clears the draft: the thanks screen closes itself, and the form reopens empty
  await page.getByLabel('Describe your idea').fill('Details');
  await page.getByRole('button', { name: 'Send Feedback' }).click();
  await expect(page.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Share Your Feedback' })).toBeHidden({ timeout: 5000 });
  await accountButton(page).click();
  await sheet(page).getByRole('button', { name: 'Share feedback' }).click();
  await expect(page.getByLabel('What would help?')).toHaveValue('');
  await expect(page.getByLabel('Describe your idea')).toHaveValue('');
});

test('a send that succeeds after the modal was closed says so with a toast', async ({ page }) => {
  await page.route('**/api/feedback', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await openFromSheet(page, 'Share feedback');
  await page.getByLabel('What would help?').fill('Late');
  await page.getByLabel('Describe your idea').fill('Reply');
  await page.getByRole('button', { name: 'Send Feedback' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Share Your Feedback' })).toBeHidden();
  await expect(page.getByText('Feedback sent')).toBeVisible();
});

test.describe('scroll position per list', () => {
  const MANY_TASKS = Array.from({ length: 40 }, (_, i) => ({
    id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
    userId: '22222222-2222-4222-8222-222222222222',
    title: `Task ${i}`,
    description: null,
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: null,
    createdAt: '2026-10-11T12:00:00.000Z',
    updatedAt: '2026-10-11T12:00:00.000Z',
    folder: null,
    note: { id: NOTE.id, title: `Linked ${i}` },
    tags: [],
    links: [],
  }));

  test('Tasks keeps its position after a note and after another tab', async ({ page }) => {
    await page.route(/\/api\/tasks(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: MANY_TASKS, total: MANY_TASKS.length }) }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
    const link = page.getByTitle('From note: Linked 30');
    await link.scrollIntoViewIfNeeded();
    const before = await scrollTopOf(page, 'tasks');
    expect(before).toBeGreaterThan(0);

    await link.click();
    await expect(page.locator('[data-note-editor]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-note-editor]')).toBeHidden();
    expect(await scrollTopOf(page, 'tasks')).toBeCloseTo(before, -1);
    await expect(link).toBeFocused();

    // Tasks -> Search -> Tasks
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible();
    await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
    await expect.poll(() => scrollTopOf(page, 'tasks')).toBeGreaterThan(before - 20);
  });

  test('Search results keep their position after a note', async ({ page }) => {
    const results = NOTES.length ? Array.from({ length: 40 }, (_, i) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
      title: `Result ${i}`,
      snippet: '',
      folder: null,
      tags: [],
    })) : [];
    await page.route('**/api/search*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results, total: results.length }) }),
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: 'Search notes' }).fill('result');
    const row = page.getByRole('button', { name: /Result 30/ });
    await row.scrollIntoViewIfNeeded();
    const before = await scrollTopOf(page, 'search');
    expect(before).toBeGreaterThan(0);

    await row.click();
    await expect(page.locator('[data-note-editor]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-note-editor]')).toBeHidden();
    expect(await scrollTopOf(page, 'search')).toBeCloseTo(before, -1);
    await expect(row).toBeFocused();
  });
});

test('Retry returns focus to the search box', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/search*', async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], total: 0 }) });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('milk');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();
});

import { test, expect, type Page } from '@playwright/test';
import { installMockApi, makeNotes, NOTE } from './support/mockApi';

/**
 * History-backed navigation below xl (mobile rework PR3, spec 3.3). Android back is the browser's
 * back (page.goBack()); the in-app arrow is the "Back" button. Both must follow the same rules.
 * N3 (Medium detail pane Close) arrives with the Medium two-pane layout in PR8.
 */

const NOTES = makeNotes(40);
const LAST = NOTES[NOTES.length - 1];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile shell only');
  await installMockApi(page, {
    'GET /api/notes': { notes: NOTES, total: NOTES.length },
  });
  // Any note id resolves to its fixture
  await page.route(/\/api\/notes\/[0-9a-f-]{36}$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const note = NOTES.find((n) => n.id === id) ?? NOTE;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ note }) });
  });
});

const noteRow = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(title) }).first();
const editor = (page: Page) => page.locator('[data-note-editor]');
const inAppBack = (page: Page) => page.getByRole('button', { name: 'Back', exact: true });
const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

/** The nearest scrolling ancestor of the note row, and its scrollTop. */
async function listScrollTop(page: Page, title: string): Promise<number> {
  return noteRow(page, title).evaluate((row) => {
    for (let el = row.parentElement; el; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el.scrollTop;
    }
    return document.scrollingElement?.scrollTop ?? 0;
  });
}

for (const how of ['system back', 'in-app Back'] as const) {
  test(`${how} from the editor returns to the list, scroll kept and focus on the row`, async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const row = noteRow(page, LAST.title);
    await row.scrollIntoViewIfNeeded();
    const before = await listScrollTop(page, LAST.title);
    expect(before, 'list scrolled to reach the last note').toBeGreaterThan(0);

    await row.click();
    await expect(editor(page)).toBeVisible();

    if (how === 'system back') await page.goBack();
    else await inAppBack(page).click();

    await expect(editor(page)).toBeHidden();
    await expect(noteRow(page, LAST.title)).toBeVisible();
    expect(await listScrollTop(page, LAST.title), 'scroll position kept').toBeCloseTo(before, -1);
    await expect(noteRow(page, LAST.title)).toBeFocused();
  });
}

test('after a reload inside the editor, in-app Back reaches the list (N1)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await noteRow(page, NOTE.title).click();
  await expect(editor(page)).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(editor(page)).toBeVisible();

  await inAppBack(page).click();
  await expect(editor(page)).toBeHidden();
  await expect(primaryNav(page)).toBeVisible();
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('a deep link opens the note; in-app Back reaches the list (N1)', async ({ page }) => {
  await page.goto(`/?note=${NOTE.id}`, { waitUntil: 'domcontentloaded' });
  await expect(editor(page)).toBeVisible();
  await inAppBack(page).click();
  await expect(editor(page)).toBeHidden();
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('a deep link, after the first interaction, lets system back reach the list (N2)', async ({ page }) => {
  await page.goto(`/?note=${NOTE.id}`, { waitUntil: 'domcontentloaded' });
  await expect(editor(page)).toBeVisible();
  // First user activation pushes the editor entry over a root entry
  await editor(page).click({ position: { x: 20, y: 20 } });
  await page.goBack();
  await expect(editor(page)).toBeHidden();
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('Notes -> Tasks pushes, Tasks -> Search replaces, back returns to the Notes root', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await primaryNav(page).getByRole('button', { name: 'Search' }).click();
  await expect(primaryNav(page).getByRole('button', { name: 'Search' })).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(primaryNav(page).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('Back from a Tasks or Search tab root after a reload reaches the Notes root (N1)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(primaryNav(page).getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(primaryNav(page).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
});

test('the account menu closes on system back; Settings returns to the tab, not the menu', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Account menu' }).click();
  const sheet = page.getByRole('dialog', { name: 'tester' });
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(noteRow(page, NOTE.title)).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await sheet.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^Profile/ }).click();
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('after a reload on a Settings section, in-app Back reaches the Settings list (N1)', async ({ page }) => {
  await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await inAppBack(page).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await inAppBack(page).click();
  await expect(noteRow(page, NOTE.title)).toBeVisible();
});

test('a live resize between 412 and 841 keeps the open note', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fold-cover', 'one resize run is enough');
  await page.setViewportSize({ width: 412, height: 797 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await noteRow(page, NOTE.title).click();
  await expect(editor(page)).toBeVisible();

  await page.setViewportSize({ width: 841, height: 701 });
  await expect(editor(page)).toBeVisible();
  await expect(page.getByPlaceholder('Untitled Note')).toHaveValue(NOTE.title);

  await page.setViewportSize({ width: 412, height: 797 });
  await expect(editor(page)).toBeVisible();
  await expect(page.getByPlaceholder('Untitled Note')).toHaveValue(NOTE.title);
});

import { test, expect, type Page } from '@playwright/test';
import { installMockApi, NOTE } from './support/mockApi';

/**
 * Mobile shell (mobile rework PR3, spec 3.1, 3.4, 7, 8, 9.1). Below xl (Compact, and Medium until
 * PR8 brings the rail) the app has a top bar (account menu, title, notifications) and a bottom
 * "Primary" tab bar with Notes, Tasks and Search. The desktop project (E2E_DESKTOP=1) checks that
 * desktop keeps its header and has no tab bar.
 */

const isDesktop = (name: string) => name === 'desktop';
const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test('desktop keeps its header and has no tab bar', async ({ page }, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'desktop only');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /fairly long title/ }).first()).toBeVisible();
  await expect(primaryNav(page)).toHaveCount(0);
});

test.describe('below xl', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(isDesktop(testInfo.project.name), 'mobile shell only');
  });

  test('the tab bar has Notes, Tasks and Search, Notes current', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const nav = primaryNav(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button')).toHaveText([/Notes/, /Tasks/, /Search/]);
    await expect(nav.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Tasks' })).not.toHaveAttribute('aria-current', 'page');
  });

  test('every tab is reachable', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const nav = primaryNav(page);

    await nav.getByRole('button', { name: 'Tasks' }).click();
    await expect(nav.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Pick up the dry cleaning')).toBeVisible();

    await nav.getByRole('button', { name: 'Search' }).click();
    await expect(nav.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible();

    await nav.getByRole('button', { name: 'Notes' }).click();
    await expect(nav.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: /fairly long title/ }).first()).toBeVisible();
  });

  test('the editor is a pushed screen with Back and no tab bar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /fairly long title/ }).first().click();
    await expect(page.locator('[data-note-editor]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await expect(primaryNav(page)).toBeHidden();
  });

  test('no control in the shell is under 44px', async ({ page }) => {
    const small = async () =>
      page.evaluate(() => {
        const roots = Array.from(document.querySelectorAll('[data-mobile-shell]'));
        const out: string[] = [];
        for (const root of roots) {
          for (const el of Array.from(root.querySelectorAll('button, a[href], input, select, [role="button"]'))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.width < 44 || r.height < 44) {
              out.push(`${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          }
        }
        return { roots: roots.length, out };
      });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(primaryNav(page)).toBeVisible();
    let res = await small();
    expect(res.roots, 'shell regions marked data-mobile-shell').toBeGreaterThanOrEqual(2);
    expect(res.out, 'notes root').toEqual([]);

    await primaryNav(page).getByRole('button', { name: 'Tasks' }).click();
    res = await small();
    expect(res.out, 'tasks').toEqual([]);

    await primaryNav(page).getByRole('button', { name: 'Notes' }).click();
    await page.getByRole('button', { name: /fairly long title/ }).first().click();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    res = await small();
    expect(res.out, 'editor').toEqual([]);
  });

  test('Search finds a note and opens it', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await primaryNav(page).getByRole('button', { name: 'Search' }).click();
    const box = page.getByRole('searchbox', { name: 'Search notes' });
    await expect(box).toBeFocused();
    await box.fill('milk');
    const result = page.getByRole('button', { name: new RegExp(NOTE.title) });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.locator('[data-note-editor]')).toBeVisible();
  });

  test('folders are reachable from the Notes title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /All notes/ }).click();
    await page.getByRole('button', { name: /^Work/ }).first().click();
    await expect(page.getByRole('button', { name: /Work/ }).first()).toBeVisible();
    await expect(primaryNav(page)).toBeVisible();
  });

  test('the account menu is a dialog that Escape closes, returning focus', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const opener = page.getByRole('button', { name: 'Account menu' });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'tester' });
    await expect(sheet).toBeVisible();
    for (const name of ['Settings', "What's New", 'Share feedback', 'Sign out']) {
      await expect(sheet.getByRole('button', { name })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('Settings is a list of sections, each a page with Back', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('dialog', { name: 'tester' }).getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /^Profile/ }).click();
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect(page.getByText('Account Information')).toBeVisible();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});

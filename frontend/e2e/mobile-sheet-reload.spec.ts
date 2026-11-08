import { test, expect } from '@playwright/test';
import { installMockApi, NOTE } from './support/mockApi';

/**
 * The account sheet is a transient overlay (mobile rework PR3): it is a history entry so system back
 * closes it, but a reload must not bring it back open. Reload keeps navigation depth otherwise.
 */

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile shell only');
  await installMockApi(page);
});

test('a reload with the account sheet open lands on the screen under it, sheet closed', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: new RegExp(NOTE.title) }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeHidden();

  // The sheet entry was popped, not left behind: system back does not reopen it or trap the user
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeHidden();
});

test('a reload on the Tasks tab with the sheet open keeps the Tasks tab', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Pick up the dry cleaning')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'tester' })).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Tasks' }),
  ).toHaveAttribute('aria-current', 'page');
});

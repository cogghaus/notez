import { test, expect, type Page } from '@playwright/test';

/**
 * Sign-in lands in the app (production report 2026-10-15: password sign-in stuck on "Signing in...",
 * Pocket ID looped back to the login page, a reload showed the signed-in app).
 * Hermetic: /api/* is mocked. /api/auth/me answers 200 only with a bearer token, as the server does.
 */

const USER = {
  userId: '22222222-2222-4222-8222-222222222222',
  username: 'tester',
  email: 'tester@example.com',
  role: 'USER',
  isServiceAccount: false,
  mustChangePassword: false,
  oidcLinked: true,
};

/** Another account whose token a shared browser may still hold. */
const OTHER = { ...USER, userId: '33333333-3333-4333-8333-333333333333', username: 'someone-else' };

async function mockApi(page: Page, opts: { refreshOk: boolean; mustChangePassword?: boolean }) {
  const loginUser = { ...USER, mustChangePassword: !!opts.mustChangePassword };
  // The mock only honours tokens it issued, like the server.
  const users: Record<string, typeof USER> = { 'tok-login': loginUser, 'tok-refresh': USER, 'tok-other': OTHER };
  await page.route(
    (url) => url.pathname.startsWith('/api/') && !/\.(ts|tsx|js|css)$/.test(url.pathname),
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const bearer = (req.headers()['authorization'] ?? '').replace(/^Bearer /, '');
      const authed = bearer in users;
      const json = (status: number, body: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/auth/setup-needed') return json(200, { setupNeeded: false });
      if (path === '/api/auth/oidc/config') return json(200, { enabled: true, providerName: 'Pocket ID' });
      if (path === '/api/auth/login') return json(200, { accessToken: 'tok-login', user: loginUser });
      if (path === '/api/auth/refresh')
        return opts.refreshOk ? json(200, { accessToken: 'tok-refresh' }) : json(401, { message: 'no cookie' });
      if (path === '/api/auth/me') return authed ? json(200, { user: users[bearer] }) : json(401, { message: 'Unauthorized' });
      if (path.startsWith('/api/profile/avatar/')) return route.fulfill({ status: 404, body: '' });
      if (!authed) return json(401, { message: 'Unauthorized' });
      if (path === '/api/notes') return json(200, { notes: [], total: 0 });
      if (path === '/api/folders') return json(200, { folders: [] });
      if (path === '/api/tags') return json(200, { tags: [] });
      if (path === '/api/notes/stats')
        return json(200, { unfiledNotes: 0, deletedNotes: 0, sharedByMeCount: 0, sharedWithMeCount: 0 });
      if (path === '/api/notifications/unread-count') return json(200, { count: 0 });
      return json(200, {});
    },
  );
}

test('password sign-in lands in the app', async ({ page }) => {
  await mockApi(page, { refreshOk: false });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username or email/i).fill('tester');
  await page.getByLabel(/^password/i).fill('not-a-real-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  await expect(page.getByPlaceholder('Search notes...').first()).toBeAttached();
});

test('password sign-in lands in the app with a stale token in storage', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accessToken', 'stale'));
  await mockApi(page, { refreshOk: false });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username or email/i).fill('tester');
  await page.getByLabel(/^password/i).fill('not-a-real-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
});

// The production case: the browser already holds a valid token when the Pocket ID return lands, so
// the user is signed in before the login page mounts. The page's redirect home and its clearing of
// ?sso=complete ran in the same pass, the second won, and nothing re-triggered the redirect.
test('returning from Pocket ID while already signed in lands in the app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accessToken', 'tok-refresh'));
  await mockApi(page, { refreshOk: true });
  await page.goto('/login?sso=complete', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  await expect(page.getByPlaceholder('Search notes...').first()).toBeAttached();
});

test('an SSO error while already signed in still lands in the app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('accessToken', 'tok-refresh'));
  await mockApi(page, { refreshOk: true });
  await page.goto('/login?sso_error=expired', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
});

test('returning from Pocket ID lands in the app', async ({ page }) => {
  await mockApi(page, { refreshOk: true });
  await page.goto('/login?sso=complete', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  await expect(page.getByPlaceholder('Search notes...').first()).toBeAttached();
});

// A shared browser: the stored token is someone else's, the Pocket ID return carries this user's
// fresh session (refresh cookie). The page must adopt the new session, not keep the old identity.
test('returning from Pocket ID replaces a token another account left in storage', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('accessToken', 'tok-other');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await mockApi(page, { refreshOk: true });
  await page.goto('/login?sso=complete', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('accessToken'))).toBe('tok-refresh');
});

test('password sign-in for an account that must change its password goes to that page', async ({ page }) => {
  await mockApi(page, { refreshOk: false, mustChangePassword: true });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username or email/i).fill('tester');
  await page.getByLabel(/^password/i).fill('not-a-real-password');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/change-password$/, { timeout: 5000 });
});

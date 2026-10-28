import { test, expect, type Page } from '@playwright/test';

/**
 * Autosave must never roll the editor back.
 *
 * 1. Typing while an autosave request is in flight: the save response used to write the
 *    pre-save snapshot back into the editor, so the newer typing vanished and the caret
 *    jumped to the end of the note (reported 2026-10-28: words split across the note).
 * 2. A shared note used to lose isShared on its first title/tag/folder save (the update
 *    response does not carry it), which dropped it out of the collaborative editor.
 *
 * Hermetic: every /api/* call is answered from fixtures in this file; no backend is needed.
 */

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-11T12:00:00.000Z';

const USER = {
  userId: '22222222-2222-4222-8222-222222222222',
  username: 'tester',
  email: 'tester@example.com',
  role: 'USER',
  isServiceAccount: false,
  mustChangePassword: false,
  oidcLinked: false,
};

const NOTE = {
  id: NOTE_ID,
  title: 'Race note',
  content: 'First paragraph here.\n\nSecond paragraph here.',
  createdAt: NOW,
  updatedAt: NOW,
  folder: null,
  tags: [],
  deleted: false,
  deletedAt: null,
  permission: 'OWNER',
  isShared: false,
};

function fixtureFor(pathname: string, note: typeof NOTE): unknown | undefined {
  switch (pathname) {
    case '/api/auth/setup-needed':
      return { setupNeeded: false };
    case '/api/auth/me':
      return { user: USER };
    case '/api/auth/oidc/config':
      return { enabled: false, providerName: '' };
    case '/api/folders':
      return { folders: [] };
    case '/api/tags':
      return { tags: [] };
    case '/api/notes/stats':
      return { unfiledNotes: 1, deletedNotes: 0, sharedByMeCount: 0, sharedWithMeCount: 0 };
    case '/api/notes':
      return { notes: [note], total: 1 };
    case `/api/notes/${NOTE_ID}`:
      return { note };
    case '/api/notifications/unread-count':
      return { count: 0 };
    case '/api/notifications':
      return { notifications: [], total: 0 };
    case '/api/tasks':
      return { tasks: [], total: 0 };
    case '/api/tasks/stats':
      return { total: 0, byStatus: {}, byPriority: {} };
    case '/api/system/info':
      return { version: 'e2e' };
  }
  return undefined;
}

/**
 * Routes /api/* to the fixtures. PATCH answers after `saveDelayMs` with what was sent, shaped
 * like backend updateNote(): the note row plus tags, without isShared or permission.
 */
async function installApi(page: Page, note: typeof NOTE, saveDelayMs: number): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e-fake-token');
  });

  await page.route(
    (url) => url.pathname.startsWith('/api/') && !/\.(ts|tsx|js|css)$/.test(url.pathname),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'PATCH' && url.pathname === `/api/notes/${NOTE_ID}`) {
        const sent = req.postDataJSON() as { title: string; content?: string };
        await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
        const saved: Record<string, unknown> = { ...note, title: sent.title, content: sent.content ?? note.content };
        delete saved.isShared;
        delete saved.permission;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ note: saved }) });
        return;
      }
      const body = req.method() === 'GET' ? fixtureFor(url.pathname, note) : undefined;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
    },
  );
}

test('typing during an in-flight autosave keeps the text and the caret', async ({ page }) => {
  await installApi(page, NOTE, 1000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Race note/ }).click();
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('p')).toHaveCount(2);

  // Caret at the end of the first paragraph: the middle of the note.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' I am so g', { delay: 40 });
  // Autosave fires after 2s idle; its response takes 1s, so the next words land mid-request.
  await page.waitForTimeout(2300);
  await page.keyboard.type('lad to see you', { delay: 80 });
  await page.waitForTimeout(1500);

  await expect(editor.locator('p')).toHaveText([
    'First paragraph here. I am so glad to see you',
    'Second paragraph here.',
  ]);
});

test('a shared note stays in the collaborative editor after a title save', async ({ page }) => {
  await installApi(page, { ...NOTE, isShared: true }, 0);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Race note/ }).click();
  // No collaboration server here, so the collaborative editor never gets past loading.
  await expect(page.getByText(/collaborative editor|Connection is taking too long/)).toBeVisible();

  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.locator('input[value="Race note"]').fill('Race note renamed');
  await saved;
  await page.waitForTimeout(500);

  // The plain (non-collaborative) editor must not take over.
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  await expect(page.getByText(/collaborative editor|Connection is taking too long/)).toBeVisible();
});

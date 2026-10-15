import type { Page } from '@playwright/test';

/**
 * Hermetic API for layout e2e tests: every /api/* call is answered from these fixtures, so no
 * backend is needed. Unmatched routes are logged and answered with `{}`.
 */

export const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-11T12:00:00.000Z';

export const USER = {
  userId: '22222222-2222-4222-8222-222222222222',
  username: 'tester',
  email: 'tester@example.com',
  role: 'USER',
  isServiceAccount: false,
  mustChangePassword: false,
  oidcLinked: false,
};

const FOLDER = { id: '33333333-3333-4333-8333-333333333333', name: 'Work', icon: 'folder', noteCount: 1 };
const TAG = { id: '44444444-4444-4444-8444-444444444444', name: 'groceries', noteCount: 1 };

/** Raw HTML as stored by notes created through the API (audit 2.3: tags showed in previews). */
export const NOTE_HTML =
  '<h2>Shopping</h2><p>Buy <strong>milk</strong> and <em>eggs</em> before the weekend.</p>';

export const NOTE = {
  id: NOTE_ID,
  title: 'A note with a fairly long title for the narrow screen',
  content: NOTE_HTML,
  createdAt: NOW,
  updatedAt: NOW,
  folderId: FOLDER.id,
  folder: { id: FOLDER.id, name: FOLDER.name },
  tags: [{ id: TAG.id, name: TAG.name }],
  deleted: false,
  deletedAt: null,
  permission: 'OWNER',
  isShared: false,
};

export const TASK = {
  id: '55555555-5555-4555-8555-555555555555',
  userId: USER.userId,
  title: 'Pick up the dry cleaning',
  description: null,
  status: 'PENDING',
  priority: 'HIGH',
  dueDate: null,
  createdAt: NOW,
  updatedAt: NOW,
  folder: null,
  note: null,
  tags: [],
  links: [],
};

function fixtureFor(method: string, pathname: string): unknown | undefined {
  if (method === 'GET') {
    switch (pathname) {
      case '/api/auth/setup-needed':
        return { setupNeeded: false };
      case '/api/auth/me':
        return { user: USER };
      case '/api/auth/oidc/config':
        return { enabled: false, providerName: '' };
      case '/api/folders':
        return { folders: [FOLDER] };
      case '/api/tags':
        return { tags: [TAG] };
      case '/api/notes/stats':
        return { unfiledNotes: 0, deletedNotes: 0, sharedByMeCount: 0, sharedWithMeCount: 0, totalNotes: 1 };
      case '/api/notes':
        return { notes: [NOTE], total: 1 };
      case `/api/notes/${NOTE_ID}`:
        return { note: NOTE };
      case '/api/notifications/unread-count':
        return { count: 0 };
      case '/api/notifications':
        return { notifications: [], total: 0 };
      case '/api/tasks':
        return { tasks: [TASK], total: 1 };
      case '/api/tasks/stats':
        return { total: 1, byStatus: { PENDING: 1 }, byPriority: { HIGH: 1 } };
      case '/api/system/info':
        return { version: 'e2e' };
    }
  }
  if (method === 'PATCH' && pathname === `/api/notes/${NOTE_ID}`) {
    return { note: NOTE };
  }
  return undefined;
}

/** Signs the fake user in and routes /api/* to the fixtures. Call before page.goto. */
export async function installMockApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e-fake-token');
  });

  await page.route(
    (url) => url.pathname.startsWith('/api/') && !/\.(ts|tsx|js|css)$/.test(url.pathname),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname.startsWith('/api/profile/avatar/')) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      const body = fixtureFor(req.method(), url.pathname);
      if (body === undefined) {
        console.log(`[e2e] unmatched route: ${req.method()} ${url.pathname}`);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
}

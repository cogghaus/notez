import { test, expect, type Page } from '@playwright/test';

/**
 * Editor keyboard scroll (mobile rework PR1).
 *
 * Models Chrome Android's default on-screen keyboard behavior: the visual viewport shrinks, the
 * layout viewport does NOT (measured on a Pixel Fold: layout 411x693, visible 411x351). The test
 * replaces window.visualViewport with a controllable fake and never resizes the Playwright viewport.
 *
 * Hermetic: every /api/* call is answered from fixtures in this file; no backend is needed.
 */

const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-11T12:00:00.000Z';

function buildContent(): string {
  const paragraphs: string[] = [];
  for (let i = 1; i <= 60; i++) {
    paragraphs.push(
      `Paragraph ${i}. The quick brown fox jumps over the lazy dog while the keyboard is open, ` +
        `and this filler text exists only so the note needs scrolling.`,
    );
  }
  return paragraphs.join('\n\n');
}

const NOTE = {
  id: NOTE_ID,
  title: 'Long test note',
  content: buildContent(),
  createdAt: NOW,
  updatedAt: NOW,
  folder: null,
  tags: [],
  deleted: false,
  deletedAt: null,
  permission: 'OWNER',
  isShared: false,
};

const NOTE_SUMMARY = { ...NOTE, content: NOTE.content.slice(0, 120) };

const USER = {
  userId: '22222222-2222-4222-8222-222222222222',
  username: 'tester',
  email: 'tester@example.com',
  role: 'USER',
  isServiceAccount: false,
  mustChangePassword: false,
  oidcLinked: false,
};

/** Fixtures keyed by "METHOD pathname". Anything not listed falls through to the logged default. */
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
        return { folders: [] };
      case '/api/tags':
        return { tags: [] };
      case '/api/notes/stats':
        return { unfiledNotes: 1, deletedNotes: 0, sharedByMeCount: 0, sharedWithMeCount: 0 };
      case '/api/notes':
        return { notes: [NOTE_SUMMARY], total: 1 };
      case `/api/notes/${NOTE_ID}`:
        return { note: NOTE };
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
  }
  if (method === 'PATCH' && pathname === `/api/notes/${NOTE_ID}`) {
    return { note: NOTE };
  }
  return undefined;
}

test.beforeEach(async ({ page }) => {
  // Auth token and a controllable fake visualViewport, installed before any app script runs.
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e-fake-token');

    class FakeVisualViewport extends EventTarget {
      width = window.innerWidth;
      height = window.innerHeight;
      offsetTop = 0;
      offsetLeft = 0;
      pageTop = 0;
      pageLeft = 0;
      scale = 1;
    }
    const vv = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });

    const fire = () => {
      vv.dispatchEvent(new Event('resize'));
      vv.dispatchEvent(new Event('scroll'));
    };
    (window as unknown as { __kb: unknown }).__kb = {
      open(heightPx: number) {
        vv.height = heightPx;
        fire();
      },
      close() {
        vv.height = window.innerHeight;
        fire();
      },
    };
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );
});

interface Measure {
  innerHeight: number;
  shellBottom: number;
  scrollerBottom: number;
  scrollerTop: number;
  caretTop: number;
  caretBottom: number;
  pageScrollTop: number;
}

/** Everything the assertions need, measured in one round trip. */
async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror') as HTMLElement;
    const root = document.getElementById('root') as HTMLElement;
    let shell: HTMLElement = pm;
    while (shell.parentElement && shell.parentElement !== root) shell = shell.parentElement;

    let scroller: HTMLElement = pm;
    for (let el: HTMLElement | null = pm.parentElement; el; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        scroller = el;
        break;
      }
    }

    const sel = window.getSelection();
    let caret = { top: 0, bottom: 0 };
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
      caret = { top: r.top, bottom: r.bottom };
    }
    const sr = scroller.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      shellBottom: shell.getBoundingClientRect().bottom,
      scrollerTop: sr.top,
      scrollerBottom: sr.bottom,
      caretTop: caret.top,
      caretBottom: caret.bottom,
      pageScrollTop: document.scrollingElement?.scrollTop ?? 0,
    };
  });
}

/** Scroll the note scroller to top / bottom and report reachability and the last line position. */
async function scrollEnds(page: Page) {
  return page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror') as HTMLElement;
    let scroller: HTMLElement = pm;
    for (let el: HTMLElement | null = pm.parentElement; el; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        scroller = el;
        break;
      }
    }
    scroller.scrollTop = 0;
    const top = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    const bottomGap = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
    const paragraphs = pm.querySelectorAll('p');
    const lastParagraphBottom = paragraphs[paragraphs.length - 1].getBoundingClientRect().bottom;
    return { top, bottomGap, lastParagraphBottom, pageScrollTop: document.scrollingElement?.scrollTop ?? 0 };
  });
}

/** Wait two frames, then poll until the measurements satisfy `ready` (rAF-throttled listeners). */
async function settle(page: Page, ready: (m: Measure) => boolean) {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  await expect.poll(async () => ready(await measure(page)), { timeout: 3000 }).toBe(true);
}

/**
 * The two ways a mobile browser can make room for the keyboard:
 * - 'resizes-visual': only the visual viewport shrinks (Chrome without the meta, measured on a Pixel Fold).
 * - 'resizes-content': the layout viewport shrinks too (our meta, interactive-widget=resizes-content,
 *   and Gecko). Modelled by also shrinking the Playwright viewport.
 */
const MODES = ['resizes-visual', 'resizes-content'] as const;

for (const mode of MODES) {
  test(`[${mode}] note stays scrollable and the caret visible with the on-screen keyboard open`, async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Real mobile flow: the notes list is shown first; tap the note to open the editor.
    await page.getByRole('button', { name: /Long test note/ }).click();
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await expect(editor.locator('p')).toHaveCount(60);

    // Caret at the END of the note.
    await editor.click({ position: { x: 12, y: 12 } });
    await page.keyboard.press('Control+End');
    // Ctrl+End plus the browser's own caret-follow scroll is not reliable across emulated
    // viewports, so also set the selection to the very end explicitly. ProseMirror picks it up from
    // selectionchange. Typing at the end of a long note leaves the scroller at its end.
    await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      const paragraphs = pm.querySelectorAll('p');
      const range = document.createRange();
      const walker = document.createTreeWalker(paragraphs[paragraphs.length - 1], NodeFilter.SHOW_TEXT);
      let lastText: Node | null = null;
      while (walker.nextNode()) lastText = walker.currentNode;
      range.setStart(lastText!, lastText!.textContent!.length);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      for (let el: HTMLElement | null = pm.parentElement; el; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') {
          el.scrollTop = el.scrollHeight;
          break;
        }
      }
    });

    const viewport = page.viewportSize()!;
    const viewportHeight = viewport.height;
    const visibleHeight = Math.round(viewportHeight * 0.5);

    // ProseMirror applies the selection on selectionchange, asynchronously: poll until it settles.
    await expect
      .poll(async () => {
        const b = await measure(page);
        return b.caretBottom > 0 && b.caretBottom <= viewportHeight;
      }, { message: 'precondition: caret is on screen before the keyboard opens', timeout: 3000 })
      .toBe(true);
    const before = await measure(page);
    expect(before.shellBottom, 'shell fills the screen before the keyboard opens').toBeGreaterThan(
      viewportHeight - 2,
    );
    await expect(page.locator('html'), 'keyboard closed before it opens').toHaveAttribute('data-kb', 'closed');

    // Keyboard opens.
    if (mode === 'resizes-content') {
      await page.setViewportSize({ width: viewport.width, height: visibleHeight });
    }
    await page.evaluate((h) => (window as unknown as { __kb: { open(h: number): void } }).__kb.open(h), visibleHeight);
    const limit = visibleHeight + 1;
    await settle(page, (x) => x.shellBottom <= limit);
    await expect.soft(page.locator('html'), 'keyboard detected').toHaveAttribute('data-kb', 'open');

    const m = await measure(page);
    expect.soft(m.shellBottom, `shell bottom (${m.shellBottom}) <= visible height (${visibleHeight})`).toBeLessThanOrEqual(limit);
    expect.soft(m.scrollerBottom, `note scroller bottom (${m.scrollerBottom}) <= visible height (${visibleHeight})`).toBeLessThanOrEqual(limit);
    expect.soft(m.caretBottom, `caret bottom (${m.caretBottom}) <= scroller bottom (${m.scrollerBottom})`).toBeLessThanOrEqual(m.scrollerBottom + 1);
    expect.soft(m.caretTop, `caret top (${m.caretTop}) >= scroller top (${m.scrollerTop})`).toBeGreaterThanOrEqual(m.scrollerTop - 1);
    expect.soft(m.pageScrollTop, 'page does not pan').toBe(0);

    // Minimal writing mode: below xl, with the keyboard open and focus in the editor, the app header,
    // the folder, tag and AI rows and the bottom navigation are hidden so the note gets most of the
    // visible area.
    const minShare = testInfo.project.name === 'fold-inner' ? 0.5 : 0.6;
    const share = (m.scrollerBottom - m.scrollerTop) / visibleHeight;
    console.log(`[e2e] [${mode}] scroller ${Math.round(m.scrollerBottom - m.scrollerTop)} of ${visibleHeight} visible, share ${share.toFixed(2)} (need >= ${minShare})`);
    expect.soft(share, `note scroller share of the visible height (${share.toFixed(2)}) >= ${minShare}`).toBeGreaterThanOrEqual(minShare);
    await expect.soft(page.locator('nav').first(), 'app header hidden in writing mode').toBeHidden();
    await expect.soft(aiRows(page), 'AI actions row hidden in writing mode').toHaveCount(0);
    await expect.soft(bottomNav(page), 'bottom navigation hidden in writing mode').toBeHidden();
    await expect.soft(page.getByPlaceholder('Untitled Note'), 'title row stays').toBeVisible();

    const ends = await scrollEnds(page);
    expect.soft(ends.top, 'scroller can reach its top').toBe(0);
    expect.soft(ends.bottomGap, 'scroller can reach its bottom').toBeLessThanOrEqual(1);
    expect.soft(
      ends.lastParagraphBottom,
      `last paragraph bottom (${ends.lastParagraphBottom}) is above the keyboard (${visibleHeight}) when scrolled to the end`,
    ).toBeLessThanOrEqual(limit);
    expect.soft(ends.pageScrollTop, 'page does not pan after scrolling the note').toBe(0);

    // Focus leaves the editor while the keyboard is still up: everything returns at once, before
    // the keyboard has gone.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect.soft(page.locator('nav').first(), 'app header returns after blur').toBeVisible();
    await expect.soft(aiRows(page), 'AI actions row returns after blur').toHaveCount(1);
    await expect.soft(bottomNav(page), 'bottom navigation returns after blur').toBeVisible();

    // Keyboard closes: the shell grows back to the full height.
    if (mode === 'resizes-content') {
      await page.setViewportSize(viewport);
    }
    await page.evaluate(() => (window as unknown as { __kb: { close(): void } }).__kb.close());
    await settle(page, (x) => x.shellBottom > x.innerHeight - 2);
    await expect.soft(page.locator('html'), 'keyboard closed again').toHaveAttribute('data-kb', 'closed');
  });
}

/** Visible AI row label: "AI Actions" below sm, "AI:" from sm up. Counts only rendered ones. */
function aiRows(page: Page) {
  return page.getByText(/^(AI Actions|AI:)$/).locator('visible=true');
}

/** The mobile bottom navigation bar (below xl). */
function bottomNav(page: Page) {
  return page.locator('[data-mobile-bottom-nav]');
}

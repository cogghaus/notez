# Mobile Rework: Phased Build Plan

Status: approved by Adam 2026-10-11, including the versioning plan. Builds `02-mobile-design-spec.md` under the
decisions in `01-audit-and-decisions.md`.

## Ground rules for every phase

- One feature branch and one PR per phase, branched from the latest `main`. Never commit to `main`.
- **Bug fixes start with a failing test** that proves the bug, then the fix; the test ships with it.
- Every PR is verified in the Claude browser pane at the device matrix viewports (S23U 384x824, BRAX
  360x806, FOLD-C 412x797, FOLD-I 841x701 and 701x841, plus the keyboard state), in light and dark,
  then Adam (and Pam where listed) tests on the real devices before merge. See "Device preview".
- Pre-PR review per the Notez process: Slag (security) and Flux (architecture) from the Forge team,
  plus Pixel (UX, WCAG 2.1 AA) for every UI PR. Immediate findings fixed before the PR is presented.
- `docs/known-issues.md` and `docs/roadmap.md` updated in the same PR when an item opens or closes.
- Version files (both `package.json`, `CHANGELOG.md`, `frontend/src/data/changelog.ts`) are bumped in
  the **last commit before merge**, after rebasing on `main`, so parallel sessions do not collide on
  them. `changelog.ts` gets user-facing wording only.
- Adam merges. Deploy is the 5-minute cron pull on accserver; after each merge, confirm the new version
  shows in the UI at https://notez.cogg.haus.
- Desktop (>=1280px) must look and behave the same after every PR; each PR includes a desktop
  screenshot check at 1440x900.
- Accessibility gates for every UI PR from PR3 on (Pixel review, WCAG 2.1 AA):
  - axe-core scan in Playwright per matrix viewport, light and dark, with zero serious or critical
    violations;
  - 200% text size at 360px wide: no clipped or overlapping text, no lost controls;
  - keyboard-only pass at Medium (841x627): every control reachable and operable, visible focus;
  - Back and Escape close every sheet and menu, and focus returns to the opener (or the documented
    fallback when the opener is gone);
  - a TalkBack pass on a real device by Adam.
- Light-mode status text on mobile surfaces uses the -700 shades (D13). PR2 applies the
  `design-language.md` edits listed in the spec and logs the desktop -600 instances in
  `known-issues.md`.

## Versioning (approved 2026-10-11)

The project as a whole is a minor bump. Proposed mapping:

| PR | Bump | Reason |
| --- | --- | --- |
| PR1 | patch (1.30.5) | Bug fix, no new experience |
| PR2 | patch (1.31.1) | Bug fixes, no new experience |
| PR3 | **minor -> 1.32.0 (re-proposed, awaiting Adam)** | First PR that ships the new mobile experience (new navigation) |
| PR4 to PR9 | patch (1.32.x) | Increments within the mobile release |

Updated 2026-10-14: 1.31.0 went to the Foyer task schema (#190) between PR1 and PR2, so PR2 is a
1.31.x patch and PR3's minor moves to 1.32.0. The 2026-10-11 approval covered 1.31.0 for PR3; the
new number needs Adam's nod.

Alternative: an integration branch with all phases, one merge to `main` as 1.31.0. Rejected for now
because real-device testing and the cron deploy both run from `main`, and a long-lived branch would
collide with the parallel Infisical work.

## Device preview (real-device testing before merge)

Production deploys only from `main`, so pre-merge device testing runs on a local stack:

1. On acchome: start the dev stack with seeded test data (never production data) and run Vite with
   `--host` so it listens on the LAN.
2. Phones on the home Wi-Fi open `http://<acchome LAN IP>:5173`.
3. Limits: plain HTTP on the LAN means no install prompt and no clipboard API; PR9 (manifest) is
   therefore verified on production after merge, with a fast follow-up PR if needed.

Pam is on the home Wi-Fi (confirmed 2026-10-11), so the LAN preview covers her testing; no remote
preview route is needed.

---

## PR1: Editor keyboard scroll fix (`fix/editor-keyboard-scroll`)

The highest-pain bug, first, as its own PR.

**Step 0, device evidence (done).** Adam ran `mockups/mobile/device-check.html` on the Pixel Fold
(2026-10-11): with the keyboard up, today's structure (note A) never scrolled the note, only panned
the page; the proposed model (note B) scrolled the note to its end. Pam's run was waived by Adam.
Instead, Pam checks the PR1 preview build on her S23 Ultra before merge; if the symptom persists for
her, stop and re-diagnose with her answers to the open questions. Optional stronger repro:
Playwright's Android mode driving Chrome on the Fold over USB (`adb`), tapping into a long note so
the real keyboard opens.

**Failing test first.** Add Playwright to `frontend` (`frontend/e2e/`, projects for each matrix
viewport with mobile emulation). Test `editor-keyboard.spec.ts`, against the dev stack with a seeded
long note:
- Emulate the Android keyboard by overriding `window.visualViewport` to a reduced height and
  dispatching its `resize` event (the default Chrome behavior: visible area shrinks, layout does not).
- Assert: the app shell height follows the visible area; the focused caret line lies inside the
  visible area and above the editor's bottom edge; `document.scrollingElement.scrollTop` stays 0
  (the page does not pan); the note scroller can reach both its top and its bottom.
- On today's code this fails (the shell ignores `visualViewport` and stays at 100vh).

**Fix (intended model, from the spec):**
- `index.html` viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover,
  interactive-widget=resizes-content`.
- One `useViewportHeight` hook (or tiny module) that writes `--app-h` from `visualViewport.height`
  (fallback `100dvh`), installed once at the app root.
- `EditorPage` shell uses `height: var(--app-h)` instead of `h-screen`; exactly one scroll container
  for the note (formatted, collaborative and raw modes), `overscroll-behavior: contain`.
- `TaskForm` and `TaskImportDialog` max heights move from `vh` to the same variable.

**Acceptance criteria**
- New Playwright test fails on `main` and passes on the branch; Vitest unit test for the hook.
- At the KB state on S23U, FOLD-C and BRAX viewports: caret visible while typing at the end of a
  60-paragraph note; the note scrolls fully up and down; the page never pans.
- Chrome Android, Samsung Internet and the iodéOS browser each checked with device-check and the
  preview build; results recorded in `01-audit-and-decisions.md` section 1.1.
- Desktop unchanged.
- Pam confirms on her phone that scrolling while writing works.

## PR2: Width and Settings bugs (`fix/mobile-pane-widths`)

**Failing tests first** (Playwright, S23U and FOLD-C viewports):
- Notes list, folders and tasks panes each fill the viewport width (no dead strip).
- Editor pane width equals the viewport width; nothing in the editor header overflows
  (`scrollWidth <= clientWidth` for the header rows).
- Settings `main` has a non-zero width and shows the Profile section text.

**Fix:** inline `width` styles on pane wrappers apply only at `xl`; editor header wraps or moves
overflow actions into a menu; Settings layout fixed in `SettingsHub.tsx` (cause found during the PR). Dark-mode classes on
the note search input and tag input; strip HTML and markdown from note previews (unit test on the
strip function). Monaco follows the app theme.

**Acceptance criteria:** tests above pass; Settings usable at 360px; desktop unchanged.

## PR3: Mobile shell and navigation (`feature/mobile-shell-nav`) -> 1.32.0 (pending approval)

- `useLayoutClass()` from `matchMedia` (Compact <600, Medium 600-1279, Expanded >=1280), live on
  resize, replacing the one-time `innerWidth` checks.
- Compact: 3-tab bottom bar (Notes / Tasks / Search) with safe-area padding; Editor tab removed;
  editor opens as a pushed screen with a back arrow.
- History-backed navigation: list -> editor -> sheet each push a history entry; Android back and the
  in-app back arrow pop in the same order; deep links (`?note=`) still work.
- Avatar menu holds Settings, theme and sign out; notifications stay in the header.
- Search tab: shell plus note search (task search arrives in PR6).
- Header touch targets 44px.
- Carried from PR2 review: give `e2e/support/mockApi.ts` a fixtures-override parameter, point
  `editor-keyboard.spec.ts` at it and delete its inline fixture copy (one hermetic API for all specs).
- Carried from PR2: SettingsHub's `md:` breakpoints (`md:flex-row`, `hidden md:block`, `md:hidden`)
  become `medium:` once the `medium` screen exists, and the phone `<select>` gives way to the
  Compact list -> page render branch (spec 8).
- Carried from PR2: a persisted collapsed sidebar (`notez-sidebar-collapsed`) now shows its icon
  rail at full width in the phone Folders view (before PR2 it was a 48px strip). Ignore `collapsed`
  below xl once `useLayoutClass()` exists.

**Acceptance criteria:** Playwright: Android back from editor returns to the list with scroll
position kept; every tab reachable; no control under 44px in the shell (automated target-size
check); live resize between 412 and 841 keeps the open note. Back-stack tests: after a reload or a
deep link into a note, the in-app back arrow always reaches the list (never a no-op, Pixel N1);
closing the Medium detail pane leaves no dead back press (N3). Device check on the Fold: system back
from a deep-linked note shows the list rather than leaving the app (Chrome history intervention,
N2); if it exits, document it and rely on the in-app arrow. Pixel review approved.

## PR4: Editor writing mode (`feature/editor-writing-mode`)

- Reading state on Compact hides the bottom tab bar (D12); the editor is a full-screen page.
- Writing mode driven by focus within the editing region (title, body, formatting strip, Done,
  Details trigger) plus keyboard detection (from `--app-h` vs the stable layout height), never by
  focus on the text fields alone, so keyboard and TalkBack users can reach the strip (Pixel C1).
  Metadata rows collapse, slim title bar, formatting strip docked above the keyboard. Applies on
  Compact and Medium; the FAB hides in writing mode.
- Details sheet: folder, tags, AI actions, share, raw mode, word count, delete with Undo.
- Collaborative presence fits the slim bar.

**Acceptance criteria:** with a simulated keyboard at S23U, at least 60% of the visible height is
note text; exiting writing mode restores the layout with no jump; formatting strip actions work in
formatted and collaborative modes; Details sheet is a focus-trapped dialog with Escape and back
closing it.

## PR5: Notes list (`feature/mobile-notes-list`)

- Folder and tag filter sheet replacing the Folders tab; active filter chip on the list.
- List row anatomy per spec; new-note action per spec; virtual folders reachable from the sheet.
- Empty preview shows "No content" (spec 4.2); deferred from PR2 to keep desktop rows unchanged (D7).
- The mobile Search tab decides between the server `snippet` (desktop SearchBar) and `previewText()`.

**Acceptance criteria:** every folder, tag and virtual folder reachable in two taps from Notes;
previews never show HTML; Pixel review approved.

## PR5b: Task soft delete (`feature/task-soft-delete`, backend)

D11. Mirrors the notes model (`Note.deleted` / `deletedAt`).
- Migration: add `deleted Boolean @default(false)` and `deletedAt DateTime?` to `Task`, plus an index
  on `(userId, deleted)`. Additive only, existing rows stay visible; no backfill, no data loss. Test
  the migration against vanilla PostgreSQL before merge (a failed migration puts the container in a
  restart loop).
- `task.service.ts`: delete becomes soft; every read path (list, get, counts, kanban, MCP, search,
  note-task links) filters `deleted: false`; new restore and permanent-delete functions; a
  "Recently deleted" list.
- Routes and Zod schemas for restore, permanent delete and the deleted list; the REST/MCP delete tools
  keep their names and become soft; new restore tool in `notez-mcp` and the remote MCP registry.
- Webhooks: `task.deleted` keeps firing on soft delete; add `task.restored`; document both in
  `docs/api-reference.md`.
- Failing tests first: a deleted task must not appear in list, search, counts or MCP results, and
  must be restorable.

**Acceptance criteria:** backend tests for every read path and restore; migration verified on a copy
of the dev database; Slag (scoping: no cross-user restore) and Flux (contract and webhook semantics)
reviews; desktop task list and kanban unchanged apart from deleted tasks no longer reappearing.

## PR6: Tasks agenda (`feature/mobile-tasks-agenda`)

- Agenda groups (Overdue / Today / Upcoming / No date / Completed collapsed), compact rows, 48px
  complete target, priority shown with icon or text as well as color.
- Task search and filter chips (priority, folder, tag, show completed). **Backend change:** the tasks
  list route has no search parameter today; add `search` (title and description, case-insensitive)
  to the list query schema and `task.service.ts`, with a backend test, also exposed to the MCP list
  tool. Slag reviews the query for injection and per-user scoping.
- Due-date grouping treats `dueDate` as a calendar date, not an instant: the form stores
  `YYYY-MM-DDT00:00:00.000Z` (`TaskForm.tsx:98`), so grouping compares the `YYYY-MM-DD` part with
  the user's local date. Converting to local time would put a task due on the 12th into "Today" on
  the 11th for anyone west of UTC (Adam is on US Central). Table-driven unit test across
  time zones.
- Bottom-sheet task editor (create and edit), replacing the modal on Compact.
- Delete only from the sheet (D6), using task soft delete from PR5b (D11): the task leaves the agenda
  at once, an Undo toast restores it, and "Recently deleted" (placement per spec) restores it later.
- Focus fallback when a row disappears (complete, delete): next row in the group, else previous, else
  the group header.

**Acceptance criteria:** Pam's morning flow (open Tasks, see overdue and today, check one off) takes
at most 2 taps after launch; at least 7 task rows visible at S23U; task search finds by title and
description; Undo and Recently deleted both restore a deleted task; focus-after-removal test passes;
Pixel review approved; Pam tests on her phone.

## PR7: Quick add and gestures (`feature/tasks-quick-add`)

- Quick-add bar with the grammar from the spec (`today`, `tomorrow`, weekdays, dates, `!high`,
  `#tag`) and live preview chips; parser is a pure function with a table-driven Vitest suite
  (including ambiguous and invalid input).
- Swipe right to complete with Undo, and long-press menu (status, priority, due shortcuts); each has
  a visible non-gesture alternative.

**Acceptance criteria:** parser tests cover every grammar token and the "no match" case; a swipe that
starts within 24px of the screen edge is ignored (Android back gesture); TalkBack users can complete
and change status without gestures.

## PR8: Fold inner screen two-pane (`feature/medium-two-pane`)

- Medium layout: navigation rail, notes list plus editor, agenda plus task detail.
- Posture continuity: fold/unfold keeps the open note or task, scroll position and unsaved text;
  an open task sheet becomes the detail pane and back.

**Acceptance criteria:** Playwright resize 412x797 -> 841x701 -> 412x797 mid-edit loses no text and
keeps selection; Adam tests folding and unfolding on the Fold.

## PR9: Installable app (`feature/web-manifest`)

- `manifest.webmanifest` (standalone, start URL, theme and background colors light/dark), 192 and
  512 icons plus a maskable icon, `theme-color` metas, `mobile-web-app-capable`.
- Standalone mode respects the in-app back stack from PR3.

**Acceptance criteria:** Chrome reports the app installable (Lighthouse or DevTools manifest pane);
Adam and Pam reinstall from the browser menu and the app opens without browser chrome; verified on
production after merge.

---

## Not in this project

Offline mode and service worker; desktop redesign; kanban on phones (agenda replaces it); native apps.

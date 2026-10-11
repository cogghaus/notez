# Mobile Rework: Audit and Decisions

Status: design session record, 2026-10-11. Source of record for the mobile rework together with
`02-mobile-design-spec.md` (screens and interaction) and `03-build-plan.md` (phased PRs).

Applies to viewports below 1280px (`xl`). Desktop at 1280px and wider is out of scope except for
shared fixes that also help desktop (see D9).

---

## 1. Users and devices

| User | Device | Browser / mode | Notes |
| --- | --- | --- | --- |
| Pam | Samsung Galaxy S23 Ultra | Home-screen shortcut (browser; exact browser to confirm, Chrome or Samsung Internet) | Primary phone today |
| Pam | Brax3 (migrating soon) | iodéOS; default browser reported as a Firefox (Gecko) fork, to confirm | Must be supported |
| Adam | Pixel Fold (2023, first gen) | Home-screen shortcut, Chrome | Both postures, live fold/unfold |

Notez ships no web manifest today, so both "installed" icons are browser shortcuts, not standalone
apps.

### 1.1 Device matrix (test viewports)

CSS viewport sizes below are derived from panel resolution and typical device pixel ratio. They are
**inferred, not measured**; the device check page (`mockups/mobile/device-check.html`) confirms the
real values on each phone, and this table is updated from its readings before Phase 2 starts.

| ID | Device / posture | Panel (px) | Assumed CSS viewport | Layout class |
| --- | --- | --- | --- | --- |
| S23U | Galaxy S23 Ultra, portrait | 1440x3088 (WQHD) / 1080x2316 (FHD+ default) | 384 x 824 | Compact |
| BRAX | Brax3, portrait | 720x1612 | 360 x 806 (DPR 2, unconfirmed) | Compact |
| FOLD-C | Pixel Fold cover, portrait | 1080x2092 | 412 x 797 (DPR 2.625, unconfirmed) | Compact |
| FOLD-I | Pixel Fold inner, unfolded (landscape-shaped) | 2208x1840 | 841 x 701 (unconfirmed) | Medium (two-pane) |
| FOLD-I-P | Pixel Fold inner, rotated portrait | 1840x2208 | 701 x 841 (unconfirmed) | Medium (two-pane) |
| KB | Any compact device with keyboard open | n/a | width x (height - ~40%) | Writing mode |

Browsers in the matrix: Chrome Android (Blink), Samsung Internet (Blink, own UI), iodéOS browser
(Gecko). Each change is verified in the Claude browser pane at these viewports, then on the real
devices by Adam and Pam before merge.

---

## 2. Audit of the current mobile UI (v1.30.2, live, 2026-10-11)

Measured in the browser pane at S23U, FOLD-C and FOLD-I sizes against https://notez.cogg.haus.
Screenshots were taken but are **not committed** (they show real notes and the repo is public).

### 2.1 App shell and navigation
- **Panes do not fill the phone.** Notes list and tasks keep their desktop inline width (320px),
  folders keep 256px; a dead strip remains on the right at 384px. Cause: inline `style={{width}}`
  on pane wrappers in `EditorPage.tsx` is applied at every width.
- **Editor overflows the screen.** The editor pane measured 404px wide in a 384px viewport; the
  delete button, tag input and image button are clipped at the right edge.
- **Bottom nav has a dead tab.** Folders / Notes / Tasks / Editor; "Editor" is disabled unless a
  note is open, and "Folders" is a filter, not a destination.
- **No back-button model.** `mobileView` is plain state with no history entries; Android back leaves
  the app instead of going editor -> list.
- **Search is unreachable below 640px** (`SearchBar` is `hidden sm:block`).
- **No safe-area handling** (`viewport-fit`, `env(safe-area-inset-*)` absent); the fixed bottom
  nav sits on the gesture bar.
- **Fold inner screen wastes 540px.** At 841x701 the shell is still single-pane: a 300px notes list
  and an empty dark area; the editor is a separate tab.

### 2.2 Settings
- **Settings content is invisible on phones.** At 412px the settings `main` element renders at
  **0px wide** (content is in the DOM, verified with page text). Every settings section is
  unreachable on a phone today. Highest-severity non-editor defect.

### 2.3 Note list
- Raw HTML (`<p>`) shows in previews of notes created through the API.
- Search input is white in dark mode (no dark classes, `NoteList.tsx:214`).
- New-note button is a 28px target.

### 2.4 Editor
- **Chrome eats the screen.** Header (61) + title row + folder row + tag row + AI row = editor text
  starts at y=241 of 824; bottom nav takes 735..824. About 57% of the screen is writing space with no
  keyboard.
- **With a keyboard, about 3 lines are visible** (simulated by shrinking the viewport to 384x494).
- **Scroll bug, hypothesis (untested):** the shell is `h-screen` (100vh) with
  `overflow-hidden`, and the note scrolls inside an absolutely positioned inner scroller
  (`.tiptap-wrapper`, `inset:0; overflow-y:auto`). Since Chrome 108, the Android keyboard resizes
  only the *visual* viewport, so the layout stays 824px tall: the lower part of the inner scroller
  sits behind the keyboard and cannot be scrolled into view, and swipes can pan the visual viewport
  (whole page) instead of the note. Must be reproduced on a device before fixing (see build plan
  phase 1).
- Collaborative editor has its own scroller (`CollaborativeTiptapEditor.tsx:307`), same exposure.
- Tag input is white in dark mode; raw Monaco mode is hardcoded `vs-light`.
- No formatting toolbar on any device (markdown-only input), which is hard on a phone keyboard.

### 2.5 Tasks
- About 4 task cards per screen (cards ~110px tall with description and tags).
- Edit and delete icons are always visible on every row (28px targets) next to content: easy
  accidental delete; task delete is a **hard delete** (`task.service.ts:597`).
- Complete toggle is a 20px target.
- No due-date grouping; default sort is priority. No task search (requested by Pam).
- Filters are a collapsible panel of checkboxes and selects at default browser size.
- Create/edit is a centered modal sized with `vh`, wrong while the keyboard is open.
- Kanban is unreachable below 1280px and uses native HTML5 drag and drop, which does not work on
  touch.
- FAB overlaps the last visible card.

### 2.6 Cross-cutting
- No web manifest, service worker, `theme-color` or 512px icon.
- Touch targets under 44px throughout: header icons 36px, user menu 32px, folder row actions 22px.
- No `matchMedia` or resize listeners; the task view mode is picked once from `innerWidth`, so a
  live fold/unfold does not re-layout state that depends on width.
- No end-to-end test harness (no Playwright); no test covers layout, mobile or tasks UI.

---

## 3. Decisions

Each decision was made by Adam in the design session on 2026-10-11.

| ID | Decision | Reason |
| --- | --- | --- |
| D1 | **Compact (<600px): 3-tab bottom bar: Notes / Tasks / Search.** Folders and tags become a filter sheet inside Notes; settings via the avatar menu. The Editor tab is removed; the editor opens full screen over the list with a back arrow. | Pam's two jobs are notes and tasks; folders are a filter, not a destination; the Editor tab is a dead state. Bottom tabs are reachable one-handed. |
| D2 | **Writing mode.** When the keyboard opens in the editor: bottom bar hides, folder/tags/AI rows collapse into a Details sheet, title becomes a slim top bar, a formatting strip sits directly above the keyboard. Keyboard closes: everything returns. | Restores writing space from ~3 lines to most of the visible area; keeps metadata one tap away. |
| D3 | **Medium (600-1279px, Fold inner): two-pane with a left navigation rail.** Notes: list + editor side by side. Tasks: agenda + detail side by side. Folding mid-note on the Fold keeps the open note on the cover screen. | Uses the near-square inner screen; continuity across posture changes. |
| D4 | **Tasks home is an agenda:** grouped Overdue / Today / Upcoming / No date; compact rows with a 48px complete target; swipe right to complete; tap opens a bottom-sheet editor; quick-add bar that understands `tomorrow`, `!high`, `#tag`; in-progress via long-press or the sheet; search and filter chips on top. | Matches Pam's real use: morning review of today and overdue, quick capture, check off, edit details. Covers her requests for task search and a richer list. |
| D5 | **Installable app: web manifest only.** Standalone display, proper icons (192 and 512, maskable), theme colour, in-app back handling. No service worker or offline in this project. | Both users already launch from the home screen; standalone removes browser chrome. Offline is a separate, larger project. |
| D6 | **No delete on rows.** Delete lives in the task sheet and the editor menu, followed by an Undo toast. Swipe is only for completing a task. | Removes accidental deletes; task delete is a hard delete today, so undo needs a delayed commit or soft delete (build plan decides). |
| D7 | **Desktop (>=1280px) untouched**, except shared fixes that also help desktop. | Contains scope; desktop works today. |
| D8 | **Mockups:** interactive HTML with fake data in `mockups/mobile/` and published as private artifact links; plus a device check page for Pam and Adam. | Real devices are the test bed; the repo is public so no real content. |
| D9 | **Shared fixes allowed on desktop:** dark-mode inputs, preview HTML stripping, Settings width bug if the cause is shared. | Low risk, same components. |
| D10 | **Editor scroll bug is fixed first**, as its own PR, with a failing test before the fix. | Highest user pain; the rest of the rework builds on the corrected viewport model. |

---

## 4. Open questions for Pam

Adam asks these; answers get logged here.

1. Which browser opens Notez on the S23 Ultra: Chrome or Samsung Internet? (Open the device check page and send the screenshot.)
2. When scrolling breaks while writing: is the keyboard open? Does the whole page move instead of the note, or does the note stop moving, or does the cursor end up hidden behind the keyboard?
3. Does it happen in long notes only, or also short ones? In shared notes (with Adam) or her own?
4. Which keyboard: Samsung Keyboard or Gboard? Any one-handed or floating keyboard mode?
5. Morning routine: does she want the Tasks tab to open first, or Notes?
6. Does she use "In progress" today, or only done / not done?
7. Swipe right to complete: natural, or would she rather tap the circle only?
8. Quick add: would she type `tomorrow` or `!high` in the title, or prefer pickers?
9. Brax3: when does the switch happen, and which browser will she use there?
10. Font size: does she use a larger system font size? (Affects layout at 384px.)

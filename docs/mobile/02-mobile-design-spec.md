# Mobile Rework: Design Spec

Status: approved by Adam 2026-10-11 (revision 3, after Pixel's second review). Builds on
`01-audit-and-decisions.md` (D1 to D14 are binding).
Prototype: `mockups/mobile/prototype.html` (fake data, responsive, interactive).
The frontend developer builds from this document; `03-build-plan.md` sequences the PRs.

Conventions: sizes in px with the Tailwind class beside them. Every light token has its dark token.
Palette and icons follow `docs/design-language.md` with the D13 contrast changes listed in section
13; no new hues. Text is never below 12px (`text-xs`); boxes that contain text use `min-h-*`, never
`h-*`, so 200% text scaling reflows instead of clipping (9.2).

---

## 1. Layout classes and breakpoints

| Class | Width | Shell | Who |
| --- | --- | --- | --- |
| Compact | < 600px | Single pane, 3-tab bottom bar, editor and pages push full screen | S23U, BRAX, FOLD-C |
| Medium | 600 to 1279px | Left nav rail (72px) + two panes (list + detail) | FOLD-I, FOLD-I-P |
| Expanded | >= 1280px | Existing desktop shell, untouched (D7) | Desktop |

### 1.1 Breakpoint implementation

- Add a `medium` screen to `tailwind.config.js`. Declare the full `screens` object in ascending
  order (Tailwind emits min-width rules in config order; appending `medium` via `extend` would put
  600px rules after `xl` rules and let `medium:flex` beat `xl:hidden`):

```js
screens: { medium: '600px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' }
```

- One hook, `useLayoutClass()`, returns `'compact' | 'medium' | 'expanded'` from two `matchMedia`
  listeners (`(min-width: 600px)`, `(min-width: 1280px)`), subscribed with `change` events, never a
  one-time `innerWidth` read. Components that branch on layout read this hook; CSS handles the rest.

### 1.2 State model that survives a live resize

Layout class is derived, never stored. Navigation state is one object, independent of layout:

```ts
{ tab: 'notes' | 'tasks' | 'search',
  noteId: string | null,          // open note
  taskId: string | null,          // open task (sheet on Compact, detail pane on Medium)
  sheet: null | 'filter' | 'details' | 'task' | 'task-menu' | 'account' | 'whats-new' | 'feedback' | 'chip-picker' | 'confirm',
  page: null | 'notifications' | 'settings' | `settings:${section}`,
  draft: NewTaskDraft | null,     // survives sheet close (6.8)
  filter: { folderId, tagId }, taskFilters: {...} }
```

| Transition | Behaviour |
| --- | --- |
| Compact -> Medium with `noteId` set (unfold mid-note) | Editor leaves the push stack and renders in the right pane; the list renders left with that note highlighted; editor DOM and TipTap instance are kept (same component, different wrapper) so caret, scroll and unsaved text survive |
| Medium -> Compact with `noteId` set (fold mid-note) | Editor becomes the full-screen push; back arrow appears; the selection entry already exists (3.3) so Android back returns to the list |
| Compact -> Medium with `sheet: 'task'` | Sheet closes, `taskId` renders as the right detail pane; focus moves to the pane heading |
| Medium -> Compact with `taskId` set | Detail pane becomes the task bottom sheet, `sheet = 'task'`; the selection entry serves as the sheet entry |
| Any -> Any with `page` set (settings, notifications) | Same page, rendered full screen (Compact) or as the main region beside the rail (Medium) |
| Writing mode during resize | Keyboard closes on posture change on Android; writing mode exits by the normal rule (5.3); no special handling |

Pane widths on Medium: rail `w-[72px]`; list pane `w-64` (256px) at `medium`, `w-80` (320px) at `md`
(768px+), `w-[22.5rem]` at `lg`; detail pane `flex-1 min-w-0`. The ResizeHandle is not rendered
below `xl`.

---

## 2. Viewport model

Intended model; `03-build-plan.md` phase 1 verifies it per browser (Chrome Android, Samsung
Internet, iodéOS Gecko) and records results in `01-audit-and-decisions.md` 1.1.

### 2.1 Measured on the Pixel Fold (Chrome 152, browser tab, 2026-10-11)

| Posture | Layout viewport | With address bar collapsed | Visible with keyboard | Keyboard share |
| --- | --- | --- | --- | --- |
| Cover (FOLD-C) | 411 x 667 | 411 x 693 | 411 x 351 | about 50% |
| Inner unfolded (FOLD-I) | 841 x 627 | n/a | 841 x 297 | about 53% |

Chrome confirmed: the keyboard shrinks only the visual viewport, the layout viewport stays. The
prototype's keyboard simulation uses 50% on Compact and 53% on Medium. Every keyboard-open layout
is budgeted against 351px (Compact) and 297px (Medium) of visible height; the Fold inner screen
with the keyboard open is a wide strip, so Medium needs writing mode too (5.8). S23U and Brax3 are
still to be measured on the device check page.

### 2.2 Model

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
```

- App root: `h-[100dvh]` (fallback `height: 100vh` declared first for browsers without `dvh`),
  `overflow-hidden`, `flex flex-col`. Nothing inside uses `h-screen`, `100vh` or `position: fixed`
  for layout; bottom-docked bars (tab bar, formatting strip, quick-add) are in-flow flex children.
- Keyboard-aware fallback: a `visualViewport` `resize` + `scroll` listener writes
  `--kb-inset = max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)` to `<html>`.
  The app root height is `calc(100dvh - var(--kb-inset, 0px))`. Where `interactive-widget`
  resizes the layout viewport, `innerHeight` shrinks too and the inset computes to ~0, so the two
  mechanisms never double-subtract. Measured Chrome 152 keeps the layout viewport, so the inset
  path is the one that matters today; Gecko fork and Samsung Internet are unverified.
- Keyboard visible = `--kb-inset > 120px` OR `innerHeight < 0.75 * screen.height` (coarse pointer
  only) while focus is inside an editing region (5.3). Exposed as `useKeyboardVisible()`.
- **As built in PR1 (supersedes the two bullets above, ruling 2026-10-12):** `lib/viewport.ts`
  writes `--app-h` = `visualViewport.height * visualViewport.scale` (pinch zoom cancels out) and
  sets `html[data-kb=open|closed]` from a baseline: the full height recorded per width whenever
  nothing that takes text has focus (rotating or unfolding with the keyboard up estimates the new
  width's height from the last keyboard height). Keyboard open = baseline minus visible height >
  120px, only on touch screens and only while a text field or contenteditable has focus. This works whether the browser shrinks only the visual viewport (Chrome without
  the meta) or the layout viewport too (`resizes-content`, Gecko), where the inset formula reads ~0
  and the `screen.height` clause depends on standalone vs tab mode. The e2e covers both modes.
  Writing mode in PR1 is the minimal version: `[data-kb-hide]` regions (app header, folder/tag
  row, AI row, word count, bottom nav) hide while `data-kb=open` and focus is in the note editor,
  below xl. PR4 replaces it with the full writing mode of 5.3.
- Safe areas: top bars `pt-[env(safe-area-inset-top)]`, bottom bars
  `pb-[env(safe-area-inset-bottom)]`, side padding `px-[max(1rem,env(safe-area-inset-left))]` on
  Medium when the rail is on the left. `env()` resolves to 0 in browser-tab mode; it matters in
  standalone (section 10).
- `body { overscroll-behavior: none }`; every scroller sets `overscroll-behavior: contain` and
  `touch-action: pan-y`. Only one vertical scroller per screen (list, editor body, sheet body).

---

## 3. Navigation

### 3.1 Compact: 3-tab bottom bar (D1)

- `<nav aria-label="Primary">`, in-flow at the bottom, `min-h-14` (56px) + safe-area padding,
  `bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700`.
- Three `<button>` destinations, each `flex-1 min-h-12` full height tappable: Notes
  (`FileText`), Tasks (`CheckSquare`), Search (`Search`). Icon `w-6 h-6`, label `text-xs
  font-medium` (12px, never smaller) under it. Active: `text-blue-600 dark:text-blue-400` plus a
  56x28 pill behind the icon `bg-blue-100 dark:bg-blue-900/40 rounded-full`; `aria-current="page"`.
  Inactive: `text-gray-500 dark:text-gray-400`.
- Not rendered (no reserved space) in the editor (reading state and writing mode, D12), while
  the quick-add input has focus with the keyboard visible, and on pushed pages.
- Launch tab: last used (`localStorage notez-last-tab`), default Notes until Pam answers Q5.

### 3.2 Medium: left rail (D3)

- `<nav aria-label="Primary">` `w-[72px] h-full flex flex-col items-center bg-white dark:bg-gray-800
  border-r border-gray-200 dark:border-gray-700 overflow-hidden`.
- Top: Notez mark 32px (`py-3`). Then the same three destinations as 3.1, each `w-14 min-h-14`
  icon + `text-xs` label, same active treatment.
- Bottom (`mt-auto pb-[env(safe-area-inset-bottom)]`): Notifications (`Bell` with unread badge
  `bg-red-600 text-white text-xs` top-right) and the avatar (32px circle, `bg-blue-600`
  initial, inside a 48px target). Avatar opens the avatar menu as a popover anchored to the rail.
- At 297px of height (keyboard open) the rail's bottom group is clipped by `overflow-hidden`
  rather than overlapping the destinations; the rail stays because it costs width, not height.

### 3.3 Stack model and back (I1, N1, N2, N3)

The history stack has exactly one root entry: the Notes tab with nothing selected. Everything else
is a pushed entry with a `depth` counter in `history.state`.

Boot and depth 0 (N1):

1. At boot the app restores navigation state and `depth` from `history.state` when one exists
   (reload inside the editor, back-forward cache, tab restore). It never calls
   `replaceState({ depth: 0 })` over an existing state; only a fresh load with no state writes the
   root entry.
2. In-app Back (the arrow) is never a no-op. At `depth > 0` it calls `history.back()`. At
   `depth 0` with a child screen showing (editor, task, page, sheet, which is reachable after a
   reload or a deep link) it navigates to the parent screen through `replaceState`: sheet -> its
   screen, settings section -> settings list, page or editor -> the tab, Tasks/Search root ->
   Notes root. Only the Notes root has no arrow.

Covered by the PR3 Playwright test `frontend/e2e/mobile-back-stack.spec.ts`, case "in-app Back at
depth 0 navigates to the parent (reload inside editor, deep link, settings section)".

Push rules:

| Action | Entry |
| --- | --- |
| Switch to Tasks or Search from the Notes root | push one tab entry (depth 1). Switching between Tasks and Search replaces it. Switching to Notes pops to the root |
| Any tab tap while something is pushed above the tab (editor, sheet, page, selection) | first `history.go(-(depth - tabDepth))` back to that tab's entry, then apply the switch (the popstate handler carries a `pendingTab`). The editor is never "replaced away" |
| Compact: open a note (list -> editor) | push |
| Medium: select a note or task when nothing was selected | push one selection entry |
| Medium: select another note or task while one is selected | replace (same entry) |
| Medium: Close on the detail pane, or delete/trash of the selected item, while the selection entry is on top | `history.back()` (N3: never a `replaceState` that leaves a dead back press). If the selection entry is not on top (depth 0 after a reload), rule N1-2 applies |
| Any sheet (`filter`, `details`, `task`, `task-menu`, `account`, `chip-picker`, `confirm`), ShareDialog | push |
| Settings opened from the account menu | replace the menu's entry (back from Settings returns to the tab, not to the menu) |
| What's New or Share feedback opened from the account menu (or What's New from the Folders view) | an overlay of its own (`whats-new`, `feedback`): pushed when no overlay is open, replacing the menu's entry when opened from it. One overlay at a time, so back closes exactly one layer (as built in PR3) |
| Notifications page, Settings list, Settings section | push |
| Filter change, list scroll, writing mode, quick-add focus | nothing |

Back (arrow in the top bar, or Android system back, both run the same `popstate` handler):

| State | Back does |
| --- | --- |
| Any sheet open | Closes the sheet, returns focus to the opener; underlying screen unchanged. A new-task sheet keeps its draft (6.8) |
| Writing mode (keyboard open) | Android closes the keyboard itself first (no page event); writing mode exits by rule 5.3; a second back then acts on the editor |
| Editor (reading state), Compact | Closes the editor, returns to the list at its previous scroll position, focus on the note row that was open |
| Editor or task detail, Medium | Pops the selection entry: deselects (right pane shows the empty state); the list stays |
| Task sheet, Compact | Closes the sheet; the task stays selected in the data model but nothing is shown |
| Settings section page | Returns to the Settings list |
| Settings list, Notifications page | Returns to the tab that opened it |
| Tasks or Search tab root | Returns to the Notes root |
| Notes root | Leaves the app (standalone) or goes to the previous site (browser) |

Deep links (`?note=`, N2): at load the handler sets `noteId` and replaces the root entry with the
editor state; it does not push at load, because Chrome's history-manipulation intervention marks
entries pushed without user activation as skippable and system back could then leave the app
with one press. The editor entry is pushed on the user's first interaction (first `pointerdown`
or `keydown`), which carries activation; until then the in-app arrow still works through rule
N1-2. Verify on device (12.14).

### 3.4 Where things live

| Item | Compact | Medium |
| --- | --- | --- |
| Folders / tags filter | Sheet opened from the title chip in the Notes top bar (4.3) | Same sheet, opened from the list pane title chip |
| Notifications | `Bell` in the top bar (Notes, Tasks); opens a pushed full-screen page with back arrow | `Bell` at the rail bottom; existing popover |
| Theme toggle | Avatar menu (Light / Dark / System) and Settings > Appearance | Same |
| Settings | Avatar menu entry; pushes the Settings list (section 8) | Avatar menu entry; renders in the main region |
| Account menu (`sheet: 'account'`; "avatar menu" in earlier drafts) | Avatar (32px in a 48px target) at the left of every top bar, named "Account menu"; opens a bottom sheet: username header, Theme, Settings, What's New, Share feedback, Sign out. Each row `min-h-12`. What's New and Share feedback open as their own overlays (3.3) | Rail bottom avatar; popover with the same rows |
| Search | Search tab (section 7) | Search rail destination |
| New note | FAB (4.4) | FAB in the list pane |
| New task | Quick-add bar (6.6) | Quick-add bar in the agenda pane |
| Recently deleted tasks (D11) | Collapsed group at the bottom of the agenda (6.11) | Same |

Top bar (Compact, list screens): `min-h-14` + safe-area top, `px-2`, `bg-white dark:bg-gray-800
border-b border-gray-200 dark:border-gray-700`. Left: avatar button. Centre-left: title chip.
Right: `Bell` (48px target). Icons `w-5 h-5`, text `text-gray-700 dark:text-gray-200`.

---

## 4. Notes list on Compact

### 4.1 Row anatomy

`<button class="w-full text-left px-4 py-3 min-h-16 border-b border-gray-100 dark:border-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700">`

```
[icon 16] Title (text-[0.9375rem] leading-5 font-medium text-gray-900 dark:text-white, truncate)    2h ago (text-xs text-gray-500 dark:text-gray-400, shrink-0)
          Preview text, one line (text-sm text-gray-500 dark:text-gray-400 line-clamp-1)
          [Folder chip] [tag] [tag] (text-xs; row omitted when empty)
```

- Icon: `FileText text-gray-500` (own note), `Files text-blue-600 dark:text-blue-400` (shared),
  `Bot text-purple-600 dark:text-purple-400` (service account), `Trash2 text-gray-500` (trash).
  Shared rows add "by Jo, edit" in `text-xs text-blue-700 dark:text-blue-400` under the title.
- Folder chip only when the active filter is not that folder (All notes, Unfiled, tag views).
  Max 2 tags, `+n` overflow. Chip: `px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700
  text-gray-700 dark:text-gray-300`.
- Selected row (Medium only): `bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-600`.
- Drag-to-folder (HTML5 DnD) is desktop only; on Compact and Medium a note is moved from the
  Details sheet folder row.
- The list is `role="list"` containing only `role="listitem"` wrappers; headings and empty-state
  copy sit outside it (WCAG 1.3.1).

### 4.2 Preview text (shared fix, D9)

`previewText(content, 120)`: strip HTML tags, then markdown syntax (`#`, `*`, `_`, `>`, backticks,
`- [ ]`, link brackets keeping the label, image syntax removed), collapse whitespace, trim, cut at
120 chars on a word boundary, marking a cut with `…`. Only the first 4096 characters of the note are
stripped (several patterns are quadratic on hostile input; as built in PR2, `src/lib/previewText.ts`).
Used by NoteList on every layout and by Search results. Empty result: row shows "No content" in
`italic text-gray-500` (PR5).

### 4.3 Title chip and filter sheet

- The list title is a button: `[Folder icon] All notes [ChevronDown]`, `min-h-11 px-3 rounded-lg
  text-lg font-semibold`, `aria-haspopup="dialog"`, `aria-label="Filter notes, currently All notes"`.
  Filtered by folder: the folder's icon and name; by tag: `Tag` icon + name. A 44px `X` button
  "Clear filter" appears to the right when a filter is active.
- Filter sheet (`role="dialog"`, title "Notes"): three sections, each a `<h3 class="px-4 pt-4 pb-1
  text-xs font-semibold uppercase tracking-wide text-gray-500">`:
  - Views: All notes (`Folder`), Unfiled (`Inbox`), Shared with me (`Users`), My shares
    (`Share2`), Trash (`Trash2`), Service Accounts (`Bot`, admin only). Rows `min-h-12 px-4`,
    count on the right in `text-xs text-gray-500`.
  - Folders: each folder row with its icon and count; trailing `MoreVertical` 44px button opens
    rename / change icon / delete (existing EditableListItem behaviour). Last row "New folder"
    (`FolderPlus`, `text-blue-700 dark:text-blue-400`).
  - Tags: wrapped chips `min-h-9 px-3 rounded-full`, same tokens as 4.1 chips; selected
    `bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`.
  - Every option is a `<button>`; the current one carries `aria-current="true"` and a `Check`
    icon (I4: no radio semantics without the radio keyboard model). Selecting closes the sheet,
    applies the filter, scrolls the list to top.

### 4.4 New note action

FAB, not a top-bar button: `w-14 h-14 rounded-full bg-blue-600 dark:bg-blue-500 text-white
shadow-lg` with `Plus w-6 h-6`, `aria-label="New note"`, positioned `absolute right-4 bottom-4`
inside the list column (which ends at the tab bar on Compact). Reason: the bottom-right corner is
inside the one-handed thumb zone; the top bar is the hardest reach on a 6.8" phone, and the bottom
bar is navigation, not creation. The list has `pb-24` (96px) so the last row is never under the
FAB (audit 2.5). Hidden in Trash, Shared with me, My shares, Service Accounts, and on Medium
while writing mode is active (I7: it would cover a list row in the 297px strip). Creating a note
opens the editor with the title selected (existing behaviour) and pushes a history entry.

### 4.5 States

Loading: 6 skeleton rows (`animate-pulse bg-gray-100 dark:bg-gray-700 rounded h-4`). Empty per
view: existing copy, centred, `text-sm text-gray-500`, plus the FAB hint "Tap + to create one"
where creation is allowed. Error: inline banner `bg-red-50 dark:bg-red-900/20 text-red-700
dark:text-red-300` with a "Retry" button. Long titles truncate; 0-tag and 0-folder rows drop line 3.

---

## 5. Editor (D2, D12)

### 5.1 Reading state (keyboard closed), Compact

```
Top bar min-h-14: [Back 48px] [Title input flex-1, text-lg font-semibold, single line] [Presence avatars] [Details 48px]
Meta strip min-h-9: [Folder chip] [tag] [tag] [+ tag]   (horizontal scroll, no wrap; tap any = Details sheet at that field)
Banner (only when relevant) min-h-8 text-xs: "View only, shared by Jo" / "Shared, you can edit" / "In trash. Restore to edit"
Editor body: flex-1 min-h-0, the only scroller
(no tab bar: the editor is a full-screen page, D12; the Back arrow is the exit and is never a no-op, 3.3)
```

- Back: `ArrowLeft`, `aria-label="Back to notes"`. Details: `MoreVertical`,
  `aria-label="Note details"`, `aria-haspopup="dialog"`.
- Title: `bg-transparent border-0 focus:ring-0 placeholder:text-gray-500`, `enterkeyhint="next"`
  (Enter moves focus to the body). Disabled when read-only (`opacity-60`).
- Save status is not in the bar. It lives in the Details sheet header and as a toast only on
  failure (existing behaviour). Collaborative notes show "Live" there instead.
- Body: `.ProseMirror { font-size: 1rem; line-height: 1.6; padding: 16px 16px 50vh }` on Compact
  (large bottom padding so the last line can scroll above the strip). Focus ring stays the inset
  blue glow.
- Presence (collaborative notes): up to 3 avatars 24px, overlapping `-space-x-2`, each
  `border-2 border-white dark:border-gray-800` with the user's cursor colour; `+n` chip beyond 3;
  `aria-label="Also editing: Jo, Sam"`. Writing mode shrinks them to 20px.
- The whole editor section is one editing region (`data-editing-region`): title, body, Done,
  Details trigger and the formatting strip. Focus moving between them never counts as leaving.

### 5.2 Writing mode (keyboard open), Compact

```
Top bar min-h-11: [Done 48px, Check icon] [Title input, text-base, truncate] [Presence] [Details 48px]
Editor body: flex-1 (the keyboard-aware root has already shrunk)
Formatting strip min-h-11: horizontal scroll of 44x44 buttons
(keyboard)
```

Budget at the measured 411 x 351 (cover screen, keyboard open): title bar 44 + strip 44 = 88px of
chrome, 263px of editor; with the 16px top padding and paragraph margins that is 8 to 9 lines of
16px / 1.6 text. Neither bar may grow: no second row, no banner, no meta strip.

Hidden in writing mode: meta strip, banner (except trash and view-only, which block editing
anyway, so writing mode cannot start there). Nothing animates height; the strip appears with
`opacity` 150ms only (no transform), so there is no layout jump on keyboard open or close.

### 5.3 Entering and leaving writing mode (C1)

Writing mode = focus is within the editing region (5.1, `focusin` / `focusout` with
`relatedTarget`, or `:focus-within`) AND the keyboard is visible (2.2). It is never keyed to the
body alone: tapping a strip button, Done or Details moves focus inside the region and must not
collapse the strip (WCAG 2.1.1, keyboard users tab into the toolbar). Leave when the keyboard
hides (`--kb-inset` back under 120px, or `innerHeight` restored) OR focus leaves the region.
Hardware keyboard on the Fold or a desktop: focus without a visible keyboard keeps the reading
layout; the formatting strip still shows while focus is within the region. "Done" calls
`editor.commands.blur()`, which closes the soft keyboard on Android and therefore exits writing
mode. On touch, strip buttons `preventDefault()` on `pointerdown` (pointerType `touch` or `pen`
only) so the soft keyboard does not flicker; mouse and keyboard users get normal focus movement.
Applies on Compact and Medium alike (5.8).

### 5.4 Formatting strip

`<div role="toolbar" aria-label="Formatting" class="min-h-11 flex items-center overflow-x-auto
bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 pl-1 pr-6 gap-0.5
snap-x">`. Each button `w-11 min-h-11 rounded-md snap-start`, icon `w-5 h-5`, `aria-label`,
`aria-pressed` for toggles; active `bg-blue-100 dark:bg-blue-900/40 text-blue-700
dark:text-blue-300`, inactive `text-gray-700 dark:text-gray-200`. The `pr-6` (24px) end padding
keeps the last button out of the Android back-gesture zone (I5).

Order (most used first, left is reachable without scrolling at 360px: 8 buttons visible):
Undo, Redo | Bold, Italic, Strikethrough | Bullet list, Numbered list, Task list | Heading 1,
Heading 2 | Blockquote, Code block, Link, Image. Dividers `w-px h-6 bg-gray-300 dark:bg-gray-600`.
13 buttons = 572px, so the strip scrolls on Compact and fits on the Fold inner pane; the title
bar's Done button is the keyboard dismiss, so nothing is pinned at the strip's right edge. Link
opens a small sheet (URL field); Image opens the file picker (existing upload path). Raw markdown
mode: strip hidden.

Arrow keys move between toolbar buttons (roving tabindex); Tab leaves the toolbar back to the editor.

### 5.5 Details sheet (`role="dialog"`, `aria-labelledby` = note title)

Rows `min-h-12 px-4`, in this order:

1. Header: note title (truncate), status line `text-xs text-gray-500`: "Saved just now" /
   "Saving" / "Live (shared)" / "Read only"; Close `X` 48px.
2. Folder: `Folder` icon, folder name or "No folder", `ChevronRight`; opens a folder picker sheet
   (Views excluded, buttons with `aria-current`, "No folder" first). Owner only.
3. Tags: existing `TagInput`, chips + add field, `enterkeyhint="done"`.
4. AI actions: three chips `min-h-9 px-3 rounded-full text-sm` with `Sparkles` prefix: Summarize,
   Suggest title, Suggest tags; disabled when the note is empty; loading shows a spinner and the
   row is `aria-busy`. Pills `bg-purple-50 text-purple-700`, `bg-blue-50 text-blue-700`,
   `bg-green-50 text-green-700` with `dark:bg-*-900/30 dark:text-*-300`.
5. Share (owner only): `Share2`, "Not shared" or "Shared with 2 people", `ChevronRight`; opens
   ShareDialog as a full-height sheet on Compact.
6. View: `Code` icon, "Raw markdown" with a switch (`role="switch" aria-checked`). On Compact,
   raw mode renders a `<textarea class="font-mono text-sm">` rather than Monaco (see 12.1).
7. Markdown help: `HelpCircle`, opens the existing MarkdownHelp as a sheet.
8. Info (static, `text-xs text-gray-500`): words, characters, created, updated, owner when shared.
9. Danger: "Move to trash" `text-red-700 dark:text-red-400` with `Trash2`; confirm dialog as
   today, then toast "Moved to trash" with Undo (calls restore). In trash: "Restore" primary
   button and "Delete forever" danger (confirm dialog, no undo).

Medium: same sheet content as a centred dialog `max-w-md`, `max-h-[92%]` of the keyboard-aware
root so it still fits in 297px. Sheets have no drag handle (a handle that does not drag is a false
affordance; drag-to-dismiss is not in scope, Close and Back are the dismissals).

### 5.6 Scroll behaviour (requirements for D10 and the build plan)

- The editor body (`.tiptap-wrapper`, and the collaborative editor's own scroller) is the only
  vertical scroller on the screen; the page never scrolls (`#root` is `h-[100dvh] overflow-hidden`).
- Caret always visible above the strip: TipTap `editorProps: { scrollThreshold: { bottom: 64 },
  scrollMargin: { bottom: 64 } }` plus `scroll-padding-bottom: 4rem` on the scroller.
- Keyboard open: the root shrinks (`--kb-inset`, since Chrome keeps the layout viewport), the
  scroller shrinks with it, the strip stays in flow at the bottom. No element is `position: fixed`.
- Keyboard close: root grows back; scroll position is preserved by the browser because the scroller
  element is unchanged.
- Test (failing first, per D10): at 411 x 351 (keyboard simulated by shrinking the viewport)
  typing 40 lines keeps the caret within the scroller's visible box and
  `document.scrollingElement.scrollTop` stays 0. Repeat at 841 x 297.

### 5.7 Editor states

Loading: skeleton title + 6 lines. No note (Medium right pane): existing "No note selected" empty
state plus a "New note" button. Load error: inline retry. Read only (trash, VIEW): title disabled,
body `contenteditable=false`, strip never shown, Details shows the reason. Collaborative connect
failure: banner "Reconnecting" `bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200`.

### 5.8 Writing mode on Medium (Fold inner, keyboard open) (I7)

Measured: 841 x 297 visible. Height is the scarce axis, width is not, so:

- Rail and list pane stay. They cost width only; collapsing them would reflow the editor on every
  keyboard open and close (a layout jump on the axis the user is reading) for no height gain. The
  list pane's FAB is hidden while writing mode is active (it covered a row).
- The editor pane enters writing mode exactly as on Compact (5.2): title bar 44, meta strip and
  banners hidden, strip 44 docked at the bottom of the pane. Honest budget: 297 - 88 = 209px of
  scroller, minus 16px top padding = 193px of text; at 25.6px per line with paragraph margins
  (`0 0 .6em`) that is 5 to 6 lines when the caret is mid-paragraph and about 4 lines when the
  caret sits under a heading or between paragraphs (what Pixel observed). It is cramped but
  workable for Pam's short notes; the real lever is the keyboard itself (Gboard floating or
  compact mode, recorded on the device check page). No further chrome may be added to this state.
- The 13-button strip (572px) fits the 449px-wide pane only with scroll at `md`; at `lg` it fits
  without.
- Sheets and dialogs on Medium are `max-h-[92%]` of the root, so a 297px root gives a 273px
  dialog with internal scroll. The task sheet's title field is the first thing inside, so the
  keyboard-open case still shows the field being edited.
- Entering and leaving follow 5.3. Rotating the inner screen to portrait (701 x 841) with the
  keyboard open gives roughly 701 x 400 visible: same rules, more room.

---

## 6. Tasks agenda (D4)

### 6.1 Structure (Compact)

```
Top bar min-h-14: [Avatar] Tasks [Bell]
Scrollable column (one scroller):
  Search row: input min-h-11 "Search tasks" (Search icon, clear X), scrolls away with the list
  Chips row min-h-10: [Priority] [Folder] [Tag] [Show completed]   (horizontal scroll, pr-6)
  Group: OVERDUE (sticky header min-h-9) rows...
  Group: TODAY rows...
  Group: UPCOMING rows... (each row's due chip shows weekday or date)
  Group: NO DATE rows...
  Group: COMPLETED (collapsed by default, header shows count)
  Group: RECENTLY DELETED (collapsed, only when non-empty, 6.11)
  pb-4
Quick-add bar min-h-14 (in flow, above the tab bar)
Tab bar min-h-14
```

Search is local to the agenda (title, description, tag names), debounced 200ms, filters rows in
place and keeps grouping. Chips: `min-h-9 px-3 rounded-full border border-gray-500 text-sm
text-gray-700 dark:text-gray-200` (one chip border token everywhere: gray-500 in both themes,
9.5); active `bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300
dark:border-blue-700` and the chip label becomes the value ("High", "Garden", "#plants").
Priority, Folder and Tag chips open a single-select picker sheet (buttons with `aria-current`,
"Any" first). "Show completed" is a toggle chip (`aria-pressed`). Active filters are summarised
for screen readers in a visually hidden `aria-live="polite"` line ("Showing 7 tasks, filtered by
High priority").

Group markup (WCAG 1.3.1): each group is a `<section aria-labelledby="g-today">` whose heading
is the collapse button (`<h3><button id="g-today" aria-expanded>`), followed by a `<div
role="list">` that owns only `role="listitem"` rows. Headers are not inside the list.

Group headers: `sticky top-0 min-h-9 px-4 flex items-center gap-2 text-xs font-semibold uppercase
tracking-wide bg-white dark:bg-gray-900`, count badge `rounded-full px-1.5 text-xs`. Colours
(D13): Overdue `text-red-700 dark:text-red-400`, Today `text-amber-700 dark:text-amber-400`,
Upcoming and No date `text-gray-500 dark:text-gray-400`, Completed `text-green-700
dark:text-green-400`, Recently deleted `text-gray-500 dark:text-gray-400`. Collapsed state
persists in `notez-agenda-collapsed`. Empty groups are omitted, except Today, which shows "Nothing
due today" in `text-sm text-gray-500 px-4 py-3` so the morning review has an explicit answer.

Sort inside a group: due date ascending, then priority (Urgent first), then title. Grouping and
display compare the stored date part only (`dueDate.slice(0, 10)` against today's local
`YYYY-MM-DD`), never a local-time conversion (D14). In-progress tasks stay in their date group
(status is not a time) and are marked on the row (6.2); there is no In Progress group.

### 6.2 Row anatomy

```
<div role="listitem" class="relative select-none" style="touch-action: pan-y">
  underlay: absolute inset-0 bg-green-700 flex items-center pl-5 text-white (Check icon), revealed by swipe
  foreground: flex items-start min-h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 border-l-2 {priority accent}
    [complete checkbox w-12 min-h-12 (48px)] [row button flex-1: title, meta, priority indicator]
```

- Complete control: `role="checkbox" aria-checked` with `aria-label="{title}"` (the role already
  announces "checkbox, not checked"; no "Mark complete" prefix, no double announcement).
  Glyph 22px: `Circle text-gray-500 dark:text-gray-400` (pending; gray-500 is the control-boundary
  minimum, D13), `PlayCircle text-blue-600 dark:text-blue-400` (in progress, plus the words "In
  progress" in the meta line), `CheckCircle2 text-green-700 dark:text-green-400` (done), `XCircle
  text-gray-500` (cancelled). Tap toggles pending <-> done (in-progress -> done; undo restores
  in-progress).
- Row button (`flex-1 min-w-0 text-left self-stretch`) contains the title, the meta line and the
  priority indicator, so its accessible name is "{title}, {due}, {folder}, {priority}" without
  `aria-describedby` plumbing. Title `text-[0.9375rem] leading-5 font-medium text-gray-900
  dark:text-white line-clamp-2` (done: `line-through text-gray-500`). Meta line `mt-0.5 flex
  flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400`: due chip (`Clock` +
  "Tomorrow" / "Thu 16 Oct"; overdue `AlertCircle` + "2d overdue" in `text-red-700
  dark:text-red-400 font-medium`; today "Today" in `text-amber-700 dark:text-amber-400
  font-medium`), `Folder` + name, `#tag` x2 (+n), `FileText` + note title (truncate
  `max-w-24`), `Link2` + count.
- Priority indicator (right-aligned inside the row button): Urgent = `ChevronsUp` + "Urgent"
  `text-red-700 dark:text-red-400`; High = `ChevronUp` + "High" `text-orange-700
  dark:text-orange-400`; Low = `Minus` + "Low" `text-gray-500 dark:text-gray-400`; Medium shows
  nothing (default). Shape plus word are the identifying cues, so colour is never the only signal;
  the left accent border (`border-l-red-500`, `border-l-orange-500`, `border-l-blue-500`,
  `border-l-gray-400`) is a redundant, decorative cue and is not held to the 3:1 UI-component
  ratio (section 13, item 4).
- Row tap target: 56px tall minimum; a 2-line title makes 76px.

### 6.3 Swipe right to complete

- Pointer events on the foreground: `pointerdown` records start; a gesture is horizontal if
  `|dx| > 10 && |dx| > |dy|` within the first move, otherwise it is a scroll and the row ignores it.
  Only `dx > 0` moves the row (left swipe does nothing, D6). Foreground `translateX(dx)` capped at
  row width; underlay `Check` icon scales from 0.6 to 1 past the threshold.
- Edge exclusion (I5, I6): a pointer that starts within `EDGE_GESTURE_INSET` of the left or right
  screen edge never starts a swipe; it may still tap or long-press. This keeps Android's back
  gesture from racing the row. The web cannot read the system gesture inset, so the value is a
  named, configurable constant in `ui/constants.ts`, default 24px, confirmed by feel on the real
  devices (S23U, Brax3, Fold) rather than measured; adjust it there if a device still fights the
  row. The same 24px end padding (`pr-6`) is applied to every horizontal strip (chips, meta strip,
  formatting strip) so their last control is not under the right-edge gesture zone.
- Threshold: `max(96px, 40% of row width)`. Past it on release: row animates off (150ms), status
  becomes COMPLETED (optimistic), row moves to the Completed group, undo toast (6.4). Below: snap
  back 150ms. Reduced motion: no translate animation, instant.
- Alternatives: the 48px complete checkbox; the task sheet status control; the long-press menu.
- Focus after the row leaves (I2, 9.6): the next row in the same group, else the previous row,
  else the group's heading button.

### 6.4 Toasts (undo)

Toasts keep the design-language variants: success `bg-green-700 text-white` (completed, added,
restored), warning `bg-amber-700 text-white` (deleted, moved to trash: something left the list),
error `bg-red-700 text-white`, info `bg-blue-700 text-white`. Mobile uses the -700 shades for the
white-text contrast (section 13). `role="status" aria-live="polite"`, bottom of the tasks column
above the quick-add bar (`absolute bottom-16 inset-x-3`), `rounded-lg shadow-lg pl-4 min-h-12 flex
items-center`, message `text-sm`, "Undo" `text-white underline font-semibold min-h-11 px-3`, and a
44px Dismiss `X`. 5s, pausing on focus/hover. Undo restores the previous status (PENDING or
IN_PROGRESS), not just PENDING. Only one toast at a time; a new one replaces the old after
committing it. A missed Undo for a deletion is not final (6.11).

### 6.5 Long-press menu (quick actions)

Trigger: 500ms press without movement > 10px (pointer events, plus `contextmenu` prevented on
touch). Opens a bottom sheet (`role="dialog"`, labelled by the task title). Rows:

- Status: four `<button aria-pressed>` (Pending, In progress, Done, Cancelled), each
  `flex-1 min-h-12`, icon above a `text-xs` label (stacked so all four fit at 360px, and at 200%
  text the labels wrap under the icons instead of truncating).
- Priority: four `<button aria-pressed>` chips Low / Medium / High / Urgent.
- Due: shortcut buttons Today, Tomorrow, Next week (`aria-pressed` when the value matches), Pick
  date (native `<input type="date">`), Clear.
- "Open details" row (`ChevronRight`) opens the task sheet.

These are plain buttons, not radios (I4): a quick-action sheet has no radio keyboard model and
each press is an immediate command. No delete here (D6). Every change applies immediately and
closes the sheet (status, due) or stays open (priority, so a second tap is possible). Keyboard
users: the row is focusable; `Shift+F10` or the context-menu key opens the same sheet; screen
readers reach everything through the task sheet.

### 6.6 Quick-add bar

`<form class="min-h-14 px-3 flex items-center gap-2 border-t border-gray-200 dark:border-gray-700
bg-white dark:bg-gray-800">`: a 44px submit button (`Plus`, `aria-label="Add"`), input
`flex-1 min-h-11 text-base bg-gray-100 dark:bg-gray-700 rounded-lg px-3` with visible
placeholder "Add a task" and `aria-label="Add a task. Words like tomorrow, !high and #tag are
understood"` (the accessible name starts with the visible label, WCAG 2.5.3), `enterkeyhint="done"`,
and an expand button `SlidersHorizontal` 44px `aria-label="More options"` that opens the task sheet
pre-filled from the parse (or restores the saved draft, 6.8).

- In flow above the tab bar. On focus with the keyboard visible: tab bar hides, the bar sits
  directly above the keyboard (keyboard-aware root), and a preview row `min-h-9 px-3 flex gap-1.5
  overflow-x-auto pr-6` appears above the input showing parse chips (or the hint "Try: tomorrow,
  friday, !high, #garden" when nothing is parsed yet). Blur with an empty field restores the tab
  bar. At 411 x 351 the agenda keeps 351 - 56 - 36 = 259px for rows, so the user still sees the
  Today group while typing.
- Submit: Enter or the `Plus` button. Creates the task (optimistic row in the right group), clears
  the field, keeps focus for the next entry, announces "Added: {title}" via the live region.
- Medium: same bar at the bottom of the agenda pane.

### 6.7 Quick-add grammar and preview

Tokens are matched anywhere in the text, case-insensitive, whole words; the title is what remains,
whitespace collapsed. Each understood token becomes a preview chip immediately (on every input
event, no debounce):

| Input | Meaning | Chip |
| --- | --- | --- |
| `today`, `tonight` | due today | `Calendar` Today |
| `tomorrow`, `tmrw` | due tomorrow | `Calendar` Tomorrow |
| `mon` to `sun`, `monday` to `sunday` | next occurrence strictly after today | `Calendar` Thu 16 Oct |
| `next week` | next Monday | `Calendar` Mon 20 Oct |
| `in N days`, `in N weeks` | relative | `Calendar` date |
| `14 oct`, `oct 14`, `2026-10-14` | explicit date (month names and ISO) | `Calendar` date |
| `!low`, `!med`, `!medium`, `!high`, `!urgent` | priority | `Flag` High |
| `#garden` (letters, digits, hyphen) | tag, repeatable | `Tag` garden |

Not parsed: numeric `14/10` (locale ambiguity, see 12.4), times, folders. Chip colours:
date `bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`; priority uses the priority
badge tokens with -700 text in light mode; tag `bg-gray-100 dark:bg-gray-700 text-gray-700
dark:text-gray-200`. Each chip has an `X` (28px visual, 44px hit area) "Keep as text": removing the
chip puts the token back into the title literally, so a title that genuinely contains "#" or
"tomorrow" is possible. A visually hidden live region reads "Understood: due Tomorrow, High
priority" when chips change (throttled to once per second). The parsed date is sent as the
calendar date `YYYY-MM-DDT00:00:00.000Z` (D14).

### 6.8 Task sheet (editor)

Compact: bottom sheet `max-h-[92%]`, no drag handle, `role="dialog" aria-modal="true"
aria-labelledby="task-sheet-title"`, body scrolls. Medium: the right pane with the same content and
a `Close` button; Close calls `history.back()` while the selection entry is on top (3.3, N3).

Header: Close `X` (48px, left), "Task" / "New task" (`text-base font-semibold`), right: "Add"
primary button (new task only, disabled until the title is non-empty).

Fields in order (labels `text-xs font-medium text-gray-500 dark:text-gray-400 mb-1`):

1. Title: `<input class="w-full text-base font-medium min-h-11 ...">`, autofocus for new tasks,
   `enterkeyhint="done"`.
2. Status: `role="radiogroup"` with four `role="radio"` buttons (Pending, In progress, Done,
   Cancelled), roving tabindex (checked item `tabindex=0`, others -1), ArrowLeft/ArrowRight and
   ArrowUp/ArrowDown move and select, Home/End jump (I4). Same stacked icon + `text-xs` label as
   6.5.
3. Priority: `role="radiogroup"` of four radio chips with the same keyboard model.
4. Due: shortcut buttons (Today, Tomorrow, Next week, Pick date, Clear) + the current value as text.
5. Folder: row with `Folder` icon, value, `ChevronRight`; opens the folder picker sheet.
6. Tags: `TagInput`.
7. Linked note (only when `noteId`): read-only row `FileText` + title, tap opens the note (closes
   the sheet, pushes the editor).
8. Links: list of `url` rows with `ExternalLink`; "Add link" opens two fields (URL, title); max 10.
9. Description: `<textarea>` auto-growing, `text-sm`, min 3 rows.
10. Danger zone: "Delete task" `text-red-700 dark:text-red-400 min-h-12` with `Trash2`.

Save model: editing an existing task applies each field immediately (status, priority, due, folder,
tags, links: on change; title and description: 800ms after the last keystroke and on blur/close),
optimistic with rollback and error toast. There is no Cancel for edits; the sheet is a view of the
task, Close just closes. New task: nothing is sent until "Add" (or Enter in the title).

Draft rule (I6, one rule, also referenced from 3.3): closing or backing out of a New task sheet
keeps the whole draft (title, status, priority, due, folder, tags, links, description) in
`nav.draft` whenever any of those differs from a blank draft, and the quick-add field shows the
draft title. "More options" with a draft present restores it; if the quick-add text was edited
since, the text is re-parsed into the draft's title, due, priority and tags while description,
folder and links are kept. The draft is cleared only by "Add" or by clearing the quick-add field
and confirming "Discard draft?" in its `X`. A draft survives tab switches and a fold/unfold, not a
reload.

Delete (D11): immediate optimistic removal from the agenda, warning toast with Undo (6.4). The
task is soft-deleted (`deletedAt` set), never hard-deleted by this action; a missed Undo is
recoverable from Recently deleted (6.11). On Medium, deleting the selected task pops the selection
entry with `history.back()` (N3).

### 6.9 Medium: agenda + detail

Left pane: the agenda (6.1) with the quick-add bar; right pane: the task sheet content as a panel,
or the empty state "Select a task, or add one below" with the `CheckSquare` icon. Selecting a row
pushes a selection entry the first time and replaces it after (3.3). The kanban view stays desktop
only (D7); Medium has no view toggle.

### 6.10 States

Loading: 8 skeleton rows grouped under Today. Empty (no tasks at all): illustration-free copy
"No tasks yet. Add one below." pointing at the quick-add bar. Empty after filters: "No tasks match"
with a "Clear filters" button. Offline/error: banner with Retry; optimistic changes that fail roll
back with an error toast.

### 6.11 Recently deleted (D11)

Where: a collapsed group at the bottom of the agenda, after Completed, titled "Recently deleted"
with a count, rendered only when it is non-empty. Reasons: it is where the task was a moment ago
(same list, one scroll down), it needs no navigation or menu knowledge, it appears exactly when a
deletion has just happened so the recovery path is visible without being asked for, and it mirrors
the Completed group Pam already knows. The notes Trash lives in the filter sheet because notes
have a folder model; tasks do not, and a chip in the filter row would compete with real filters.
Settings was rejected as the least findable place for a recovery action.

Rows: 6.2 anatomy with the complete checkbox replaced by a 48px "Restore" button (`RotateCcw`,
`aria-label="Restore {title}"`), title `text-gray-500 dark:text-gray-400` (not struck through),
meta line adds "Deleted 2h ago". No swipe. Tap opens the task sheet in read-only form with two
actions at the bottom: "Restore" (primary, `bg-blue-600 dark:bg-blue-500 text-white`) and "Delete
forever" (`bg-red-700 text-white`, opens the existing danger confirm dialog: `Trash2` in a red
wash, "Delete forever" confirm). Restore returns the task to its previous status and group with a
success toast (no undo needed, it is reversible by deleting again). Delete forever is the only hard
delete and has no undo.

Retention wording (matches notes Trash, which has no automatic purge today): "Deleted tasks stay
here until you restore them or delete them forever." No auto-purge is introduced; if one is added
later for notes, tasks follow it in the same change.

Medium and Expanded: the same group in the agenda pane; desktop list view gets it as a shared fix
only if it falls out of the same component (D9), otherwise it stays mobile-only for this project.

Backend: additive nullable `deletedAt` on `tasks`, `DELETE /api/tasks/:id` sets it, new
`POST /api/tasks/:id/restore`, `DELETE /api/tasks/:id?permanent=true` for delete forever, list
endpoints exclude deleted tasks unless `deleted=true`; stats exclude them. The build plan sequences
this before the agenda PR.

---

## 7. Search tab

- Header: input `min-h-12 text-base` with `Search` icon, clear `X` (44px), autofocus when the tab
  is opened by tap (not on app launch), `enterkeyhint="search"`, `aria-label="Search notes and
  tasks"`. Scope chips under it: All, Notes, Tasks (three `<button aria-pressed>`, default All,
  persisted).
- Empty query: "Recent searches" list (last 8, `localStorage notez-recent-searches`), each row
  `min-h-12` with `History` icon, the query, and a trailing 44px `X` "Remove"; "Clear all" link.
  Below it a hint line: "Search titles, content, tags and task names".
- Query >= 2 chars, debounced 300ms: one request to notes search and one to tasks search in
  parallel (notes `search` param exists; the tasks `search` param lands in PR6, see 12.3).
  Results in two `<section aria-labelledby>` groups, each a sticky `<h2>` ("Notes (n)", "Tasks
  (n)") followed by its own `role="list"`; headings are outside the lists (WCAG 1.3.1):
  - Note row: 4.1 anatomy with the matched snippet (first match, 20 chars either side) and
    `<mark class="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded-sm">` highlights.
  - Task row: 6.2 anatomy without swipe (complete checkbox works), tap opens the task sheet over
    the Search tab.
- States: loading skeleton (3 rows per group), no results ("Nothing for 'compost'" plus the scope
  chips), error with Retry. Submitting (Enter) stores the query in recents.
- Medium: search in the left pane, result opens in the right pane (note editor or task panel).

---

## 8. Settings on Compact

Fixes audit 2.2 by design: the two-column settings layout becomes a list -> page push.

- Settings list page (pushed from the account menu, replacing the menu's entry): top bar `[Back]
  Settings`; rows `min-h-14 px-4 flex items-center gap-3` with icon `w-5 h-5 text-gray-500`, label
  `text-base`, optional value `text-sm text-gray-500` and `ChevronRight`. Sections (confirm the
  inventory against `SettingsHub.tsx`; the list is the union of what exists today): Profile
  (`User`), Appearance (`Palette`: theme), Security (`Shield`: password, sessions, Pocket ID), API
  tokens (`Key`), Webhooks (`Zap`), Notifications (`Bell`), AI (`Sparkles`), Import and export
  (`Download`), Admin (`Users`, admin only: users, service accounts), About (`Info`: version,
  What's New).
- Section page: `[Back] {Section}` top bar, content `px-4 py-4 max-w-xl`, forms stacked
  (`space-y-4`), inputs full width `min-h-11`, primary buttons full width on Compact. Each section
  is a history entry; back returns to the list (at depth 0 after a reload, rule N1-2 does the same
  through `replaceState`).
- Medium and Expanded: the existing two-column layout, with the content column fixed to
  `flex-1 min-w-0` (the 0px bug) so it can never collapse; the Compact list/page split is purely a
  render branch on the layout class.

---

## 9. Touch, spacing, type, theming, accessibility

### 9.1 Targets and spacing

- Minimum 44x44 for every control; 48x48 for primary row actions (complete, restore, back,
  Details, tab bar items, FAB 56). Icon buttons are `w-11 min-h-11` or `w-12 min-h-12` with the
  icon centred; never `p-1` on mobile.
- Horizontal padding 16px (`px-4`) for list rows and sheet content; 12px (`px-3`) inside bars;
  24px end padding (`pr-6`) on every horizontal strip (I5). Minimum 8px between adjacent targets.
- One-handed zones on a 384x824 screen (right thumb): easy = bottom 45% and the right half;
  stretch = top-left. Primary actions (tabs, FAB, quick-add, swipe, complete checkbox on the left
  of the row which is reachable because the thumb sweeps across) sit low; rarely used controls
  (avatar, Bell, Details) sit high.

### 9.2 Typography and text scaling (I3, WCAG 1.4.4)

| Role | Class | px at 100% |
| --- | --- | --- |
| Top bar title | `text-lg font-semibold` | 18 |
| Row title | `text-[0.9375rem] leading-5 font-medium` | 15 |
| Body, inputs | `text-base` | 16 (also prevents input zoom on WebKit) |
| Meta, tab labels, badges | `text-xs` | 12, the floor; nothing in the UI is smaller |
| Section labels | `text-xs font-semibold uppercase tracking-wide` | 12 |
| Editor body | `.ProseMirror { font-size: 1rem; line-height: 1.6 }` | 16 |

Rules: every box that contains text uses `min-h-*` (bars, chips, headers, rows, buttons), never
`h-*`; arbitrary sizes are rem (`text-[0.9375rem]`, `w-[22.5rem]`), not px; icon boxes may keep
fixed px because they hold no text; `line-clamp` for overflow; no `overflow-hidden` on a text
container with a fixed height. Acceptance: at 360px wide with 200% text (Chrome "Accessibility,
Text scaling" or `html { font-size: 200% }` in the device check page) every screen in the
prototype's state jumper is reachable, no text is clipped, nothing overflows horizontally, and the
tab bar, chips and status segments wrap or grow rather than truncate. The device check page reads
Pam's font scale (Q10) too.

### 9.3 Dark mode per surface

| Surface | Light | Dark |
| --- | --- | --- |
| App background, lists | `bg-white` | `bg-gray-900` |
| Bars (top, tab, rail, quick-add) | `bg-white border-gray-200` | `bg-gray-800 border-gray-700` |
| Formatting strip, group headers | `bg-gray-50` | `bg-gray-900` |
| Sheets | `bg-white` | `bg-gray-800` |
| Sheet backdrop | `bg-black/50 backdrop-blur-sm` | same |
| Inputs | `bg-gray-100 text-gray-900 border-gray-400` (border decorative; label and placeholder identify the field) | `bg-gray-700 text-white border-gray-500` |
| Toasts | `bg-green-700` / `bg-amber-700` / `bg-red-700` / `bg-blue-700`, `text-white` | same |
| Swipe underlay | `bg-green-700` | `bg-green-700` |
| Chips (neutral) | `bg-gray-100 text-gray-700 border-gray-500` | `bg-gray-700 text-gray-200 border-gray-500` |
| Chips (active) | `bg-blue-100 text-blue-700 border-blue-300` | `bg-blue-900/40 text-blue-300 border-blue-700` |
| Status text (D13) | `text-amber-700` / `text-green-700` / `text-orange-700` / `text-red-700` | `text-amber-400` / `text-green-400` / `text-orange-400` / `text-red-400` |
| Muted text, control boundaries | `text-gray-500`, `border-gray-500` | `text-gray-400`, `border-gray-500` |

Shared fixes (D9): NoteList search input and TagInput get `bg-white dark:bg-gray-700 text-gray-900
dark:text-white border-gray-400 dark:border-gray-500`; Monaco theme follows the document class
(`vs-dark` when `.dark`).

### 9.4 Motion

Sheets: `translateY(100%) -> 0`, 200ms ease-out; toasts: existing `toast-in`; swipe snap 150ms;
strip opacity 150ms. All guarded by `@media (prefers-reduced-motion: reduce) { transition: none;
animation: none }` on the shared sheet/toast classes. No height animations anywhere.

### 9.5 Contrast (D13, WCAG 1.4.3 text 4.5:1, 1.4.11 UI components 3:1)

Ratios from the WCAG relative-luminance formula on the Tailwind 3.4 hex values, verified by the
orchestrator; a human check against rendered pixels is still required for the translucent dark
chips.

| Pair | Ratio | Use |
| --- | --- | --- |
| gray-900 on white | 17.7:1 | titles, body |
| gray-600 on white | 7.6:1 | available for muted text where more margin is wanted |
| gray-500 on white | 4.8:1 | muted text, pending circle, chip borders (3:1 needed for the boundaries) |
| white on gray-900 | 17.7:1 | dark titles |
| gray-400 on gray-900 | 7.0:1 | dark muted text |
| gray-500 on gray-900 | 3.7:1 | dark chip borders (3:1 needed) |
| gray-500 on gray-800 | 3.0:1 | dark input and chip borders on bars and sheets (at the 3:1 line; decorative for inputs) |
| gray-300 on gray-700 | 6.8:1 | dark input placeholder (gray-400 there is 3.9:1, fails) |
| gray-100 on white | 1.1:1 | input fill; it does not identify the field, the label and placeholder do |
| amber-700 on white | 4.8:1 | Today (amber-600 was 3.2:1, failed) |
| green-700 on white | 5.0:1 | Completed, done check (green-600 was 3.3:1, failed) |
| orange-700 on white | 5.2:1 | High (orange-600 was 3.6:1, failed) |
| red-700 on white | 6.5:1 | Overdue, Urgent, delete |
| blue-600 on white | 5.2:1 | primary, active tab, in-progress icon |
| blue-700 on blue-100 | 5.5:1 | active chips, light |
| orange-500 on white | 2.8:1 | HIGH accent border only; decorative, fails 3:1 on its own, allowed because icon and word identify priority (section 13, item 4) |
| amber-400 / green-400 / orange-400 / red-400 on gray-900 | 10.6 / 10.1 / 7.8 / 6.4:1 | dark status text |
| white on green-700 / amber-700 / red-700 / blue-700 | 5.0 / 4.8 / 6.5 / 6.7:1 | toasts (white on yellow-500 was 1.9:1 and on green-600 3.3:1, failed) |
| blue-300 on blue-900/40 over gray-800 | approx 7:1 (composited), verify on device | active chips, dark |

### 9.6 Focus order, screen reader labels, focus after removal (I2)

- Tab bar and rail: `<nav aria-label="Primary">` with `<button aria-current="page">`; focus
  order: top bar (avatar, title chip, Bell), content, FAB, tab bar.
- Sheet: `role="dialog" aria-modal="true" aria-labelledby`; focus moves to the first interactive
  element (or the heading for informational sheets); Tab cycles inside; Escape and backdrop tap
  close; focus returns to the opener. Implement with the existing ConfirmDialog focus restoration
  pattern extracted into a `useFocusTrap` hook.
- Editor: Back/Done, title, presence (group `aria-label`), Details, body (`role="textbox"
  aria-multiline="true"` is provided by ProseMirror), formatting toolbar (roving tabindex). The
  strip stays mounted while focus is anywhere in the editing region (5.3).
- Task row: checkbox named by the title; row button named by title + due + folder + priority +
  "in progress" when set (6.2). Swipe and long-press have the checkbox and sheet equivalents.
- Quick-add: the input's name begins with the visible "Add a task"; chips are `role="listitem"`
  inside a `role="list" aria-label="Understood"`; each chip's remove button is labelled "Keep
  'tomorrow' as text".
- Pickers and quick actions are buttons with `aria-current` / `aria-pressed`; only the task
  sheet's status and priority are radiogroups, and those implement the arrow-key model (6.8).
- Focus after a row disappears (complete, swipe-complete, delete, restore, trash): capture before
  the mutation, then after render move focus to the next row in the same group, else the previous
  row, else the group's heading button; for a note trashed from the editor on Compact, the list
  row that followed it, else the previous, else the list title chip. Never leave focus on `body`.
- Live regions: one polite region for toasts and list announcements ("Added", "Completed",
  "Deleted, undo available", filter summaries); never more than one message per second.
- Icon-only buttons always carry `aria-label`; decorative icons `aria-hidden="true"`.

### 9.7 Accessibility acceptance hooks (for the build plan)

Each UI PR cites the ones it touches; the final mobile PR runs all of them:

1. axe-core scan (Playwright + `@axe-core/playwright`) at 360x800, 411x693, 841x627, light and
   dark, on every state in the prototype's jumper list: zero serious or critical violations.
2. Focus-after-removal test: complete, swipe-complete, delete, restore and trash each move focus
   per 9.6; `document.activeElement` is never `body`.
3. 200% text at 360px: `html { font-size: 200% }`, every jumper state renders without horizontal
   overflow (`scrollWidth <= clientWidth` on `#root`) and without clipped text (no element with
   `overflow: hidden` whose `scrollHeight > clientHeight` contains text).
4. Keyboard-only pass at Medium (841x627): every control reachable by Tab, toolbar and radiogroups
   by arrows, every sheet closable by Escape, focus visible throughout.
5. Back and Escape close every sheet; Android back on a device follows the 3.3 table (manual,
   recorded on the device check page). `frontend/e2e/mobile-back-stack.spec.ts` (PR3) covers the
   push rules, N1 (in-app Back at depth 0 after reload and deep link) and N3 (Medium Close pops).
6. TalkBack pass per UI PR on the Fold cover screen: row names as in 9.6, no double announcements,
   toasts announced once, swipe alternative discoverable.

---

## 10. Installed app (D5)

```json
{ "name": "Notez", "short_name": "Notez", "id": "/", "start_url": "/?source=pwa", "scope": "/",
  "display": "standalone", "display_override": ["standalone"], "orientation": "any",
  "background_color": "#ffffff", "theme_color": "#ffffff", "lang": "en",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" } ] }
```

- `<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">` and
  `content="#1f2937"` (gray-800, the top bar surface) for dark. When the in-app theme changes,
  JS updates the matching `meta[name=theme-color]` so the Android status bar follows the app, not
  the OS. `background_color` white is the splash; acceptable for dark users (brief flash), a dark
  splash would need a second manifest.
- Icons needed from `docs/branding/notez-sq.png`: 192, 512, maskable 512 (artwork inside the
  central 80% safe zone on a solid background), plus the existing 180 Apple touch icon. Favicons
  unchanged.
- `orientation: any` so the Fold inner screen can rotate. Status bar colour follows theme-color;
  there is no translucent status bar in `standalone` on Android, so `safe-area-inset-top` is 0
  there and the top bar does not need extra height; the bottom gesture bar does report an inset.
- Standalone removes the address bar, so the cover screen gains the 26px measured between 667 and
  693; the keyboard budget in 5.2 is unchanged (the keyboard is the same height either way).
- In-app back handling (3.3) is what makes standalone usable: without it, system back exits.

---

## 11. Fold specifics

- Hinge: the Pixel Fold (2023) inner panel is one continuous display with a crease; Chrome does
  not expose a hinge segment for it (no `viewport-segment-*` env values, `horizontal-viewport-
  segments` stays 1). Assumption: the hinge is a cosmetic crease and is ignored; a pane boundary
  may sit near it or content may cross it. If the device check page reports segments > 1, revisit
  with a `medium:` two-column grid aligned to the segment boundary.
- Inner landscape-shaped (841 x 627 measured in a browser tab, 841 x 701 expected standalone):
  Medium, rail 72 + list 320 (`md`) + detail 449. Comfortable. With the keyboard: 841 x 297, see 5.8.
- Inner rotated portrait (701 x 841): still Medium, rail 72 + list 256 (`medium`) + detail 373. The
  detail is phone-width, which is a known-good width (it is the Compact editor at 360 to 412), and
  keeping Medium avoids a layout flip on every rotation, which would also discard the push stack
  twice per rotate. Decision: never collapse to Compact above 600px.
- Posture change mid-edit: Android closes the keyboard on fold/unfold; TipTap keeps its document
  because the editor component instance is the same across the pane and push wrappers (1.2).
  The build must render `<NoteEditor>` once and move it between wrappers with a stable key, not
  mount two instances.
- Cover screen (411 x 667 in a tab, 411 x 693 with the bar collapsed): Compact; nothing
  Fold-specific beyond the keyboard budget in 5.2.

---

## 12. Design notes for review

1. Raw markdown on Compact uses a `<textarea>` instead of Monaco. Monaco's touch and soft-keyboard
   handling is poor and it is heavy on a phone; Medium and Expanded keep Monaco (with the dark
   theme fix). Deviation from `design-language.md` section 9; needs a nod.
2. Resolved by D14: due dates stay `YYYY-MM-DDT00:00:00.000Z`; grouping and display compare the
   date part only (6.1, 6.7).
3. Resolved: the tasks `search` param ships in PR6; the Search tab and the agenda search use it.
4. Numeric dates in quick-add (`14/10`) are intentionally not parsed because day/month order is
   ambiguous; month names and ISO are. Ask Pam (Q8) whether she wants `14/10` as day-first.
5. In-progress tasks are grouped by date, not in their own group (the command-center mockup had an
   In Progress group). Reason: Pam's review is time-based; status shows on the row. Reversible by
   adding a "Group in progress first" preference if she disagrees (Q6).
6. Default launch tab (Notes vs Tasks) is "last used"; Pam's answer to Q5 may change it to Tasks.
7. Keyboard detection on the iodéOS Gecko browser is unverified: `interactive-widget` support and
   `visualViewport` behaviour decide which half of section 2.2 carries the load. The device check
   page must report `innerHeight` and `visualViewport.height` with the keyboard open, as was done
   on the Fold.
8. The Notifications dropdown becomes a pushed page on Compact; confirm `NotificationBell` content
   can render inline (it is a popover today).
9. The in-list search box is removed from NoteList on Compact and Medium (the Search destination
   replaces it). Expanded keeps it.
10. The collaborative editor has its own scroller; the scroll model in 5.6 must be applied there as
    well or shared notes keep the bug after D10.
11. Settings section inventory in section 8 is from memory of the codebase; the developer confirms
    it against `SettingsHub.tsx` before building the list.
12. Resolved by D11: task delete is a soft delete with Undo plus Recently deleted (6.11); note
    delete keeps its Undo toast (restore API exists).
13. Medium writing mode keeps the rail and list pane and yields 4 to 6 visible lines at 841 x 297
    (5.8). Hiding the list pane would widen the strip but buy no height; the lever is the keyboard
    mode (Gboard floating or compact), recorded on the device check page. If Adam finds it
    unusable on the device, the fallback is a "focus" toggle in the Details sheet that hides the
    list pane while the keyboard is open; not built unless asked.
14. Verify on device (N2): open a `?note=` deep link in standalone Chrome, press system back once
    before touching anything (expected: app stays open because the root is not skippable when
    nothing was pushed), then tap once and press system back (expected: list). Also confirm the
    in-app arrow returns to the list before any interaction (N1-2). Record on the device check page.

---

## 13. Design-language changes to apply (D13; Adam edits `docs/design-language.md`)

Exact edits, one per line, all scoped "on mobile surfaces (below `xl`)" unless marked global.
Ratios are WCAG luminance on the Tailwind 3.4 hex values.

1. Section 4.2 table, Success light text: `text-green-600` -> `text-green-700` (3.3:1 -> 5.0:1 on
   white; the -600 shade fails 1.4.3). Dark stays `text-green-400`.
2. Section 4.2 table, Warning light text: `text-amber-600` -> `text-amber-700` (3.2:1 -> 4.8:1).
   Dark stays `text-amber-400`.
3. Section 4.2 table, Danger light text: keep `text-red-600` (4.8:1, passes) but note red-700 is
   used where white sits on it (toasts).
4. Section 4.3 priority badges, light text: `text-blue-600` -> `text-blue-700`, `text-orange-600`
   -> `text-orange-700` (3.6:1 -> 5.2:1), `text-red-600` -> `text-red-700`, `text-gray-600` ->
   `text-gray-700`. Border accents: LOW `border-l-gray-400` (unchanged), MEDIUM `border-l-blue-500`,
   HIGH `border-l-orange-500`. The orange-500 accent is 2.8:1 on white and fails 1.4.11 on its own;
   it stays because the accent is decorative: priority is identified by the icon and the word
   ("High" with `ChevronUp`), and the colour only reinforces them. No border colour is relied on as
   the sole cue anywhere on mobile.
5. Section 4.4 kanban column header text, light: `-600` -> `-700` for blue, green, red; gray-600
   stays (7.6:1 passes).
6. Section 7.5 toasts: Warning `bg-yellow-500 dark:bg-yellow-600` with white text (1.9:1 and
   2.4:1, fails) -> `bg-amber-700` in both themes with white text (4.8:1). Success `bg-green-600`
   -> `bg-green-700` (white on green-600 is 3.3:1, fails). Info `bg-blue-600` passes (5.2:1), keep.
   Error `bg-red-600` passes (4.8:1), keep; mobile uses red-700 for margin.
7. Section 7.2 inputs: border `border-gray-300 dark:border-gray-600` -> `border-gray-400
   dark:border-gray-500`. The border is decorative: gray-400 on white is 2.5:1 and the `bg-gray-100`
   fill is 1.1:1, so neither identifies the field; inputs are identified by their visible label and
   placeholder, and by the focus ring when active. Where a boundary is the only cue (pending circle,
   checkbox outline, chips) the token is gray-500 (4.8:1 light, 3.7:1 on gray-900).
8. Section 8 icons: add "Status glyphs that act as control boundaries (pending circle, checkbox
   outlines) use gray-500 minimum in light mode."
9. Section 11 accessibility, Color contrast paragraph: replace "Muted text uses gray-600 /
   gray-400 (AA at the typical sizes)" with "Muted text uses gray-500 (4.8:1) or darker on white
   and gray-400 (7.0:1) on gray-900; status text uses the -700 shades on white and the -400 shades
   on gray-900; every pair is listed in `docs/mobile/02-mobile-design-spec.md` 9.5."
10. Section 11, Reduced motion: add "No height animations; sheets translate, strips fade."
11. Section 13 Extending the language, rule 1: append "On white, status text is the -700 shade;
    on gray-900 the -400 shade."
12. New row in section 3.2 Surfaces: Toast surfaces `bg-green-700 / bg-amber-700 / bg-red-700 /
    bg-blue-700` with `text-white` (same in dark).
13. Section 7.7 Tags and any chip: one border token, `border-gray-500`, in both themes.
14. Known-issues entry (Adam's `known-issues.md`): desktop still uses -600 status text in
    `KanbanBoard.tsx`, `TaskItem.tsx`, `NotificationBell`, `Toast.tsx`; sweep after this project
    (D7 keeps desktop untouched here).

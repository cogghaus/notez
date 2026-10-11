# Mobile Rework: Design Spec

Status: design spec, 2026-10-11. Builds on `01-audit-and-decisions.md` (D1 to D10 are binding).
Prototype: `mockups/mobile/prototype.html` (fake data, responsive, interactive).
The frontend developer builds from this document; `03-build-plan.md` sequences the PRs.

Conventions: sizes in px with the Tailwind class beside them. Every light token has its dark token.
Palette, icons and motion follow `docs/design-language.md`; no new hues.

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
  sheet: null | 'filter' | 'details' | 'task' | 'task-menu' | 'avatar' | 'chip-picker',
  page: null | 'notifications' | 'settings' | `settings:${section}`,
  filter: { folderId, tagId }, taskFilters: {...} }
```

| Transition | Behaviour |
| --- | --- |
| Compact -> Medium with `noteId` set (unfold mid-note) | Editor leaves the push stack and renders in the right pane; the list renders left with that note highlighted; editor DOM and TipTap instance are kept (same component, different wrapper) so caret, scroll and unsaved text survive |
| Medium -> Compact with `noteId` set (fold mid-note) | Editor becomes the full-screen push; back arrow appears; history already holds an editor entry (see 3.3) so Android back returns to the list |
| Compact -> Medium with `sheet: 'task'` | Sheet closes, `taskId` renders as the right detail pane; focus moves to the pane heading |
| Medium -> Compact with `taskId` set | Detail pane becomes the task bottom sheet, `sheet = 'task'`; a history entry is pushed if one is not present |
| Any -> Any with `page` set (settings, notifications) | Same page, rendered full screen (Compact) or as the main region beside the rail (Medium) |
| Writing mode during resize | Keyboard closes on posture change on Android; writing mode exits by the normal rule (5.3); no special handling |

Pane widths on Medium: rail `w-[72px]`; list pane `w-64` (256px) at `medium`, `w-80` (320px) at `md`
(768px+), `w-[360px]` at `lg`; detail pane `flex-1 min-w-0`. The ResizeHandle is not rendered
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

Chrome confirmed: the keyboard shrinks only the visual viewport, the layout viewport stays. These
numbers replace the "about 40%" assumption; the prototype's keyboard simulation uses 50% on
Compact and 53% on Medium. Consequences: every keyboard-open layout is budgeted against 351px
(Compact) and 297px (Medium) of visible height, and the Fold inner screen with the keyboard open is
a wide strip (841 x 297), so Medium needs writing mode too (5.8). S23U and Brax3 are still to be
measured on the device check page.

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
  mechanisms never double-subtract. Where it does not (measured: Chrome 152 in a browser tab keeps
  the layout viewport; Gecko fork and Samsung Internet unverified), the inset carries the
  correction. The measured Chrome behaviour means the inset path is the one that matters today.
- Keyboard visible = `--kb-inset > 120px` OR `innerHeight < 0.75 * screen.height` (coarse pointer
  only) while an editable element has focus. Exposed as `useKeyboardVisible()`.
- Safe areas: top bars `pt-[env(safe-area-inset-top)]`, bottom bars
  `pb-[env(safe-area-inset-bottom)]`, side padding `px-[max(16px,env(safe-area-inset-left))]` on
  Medium when the rail is on the left. `env()` resolves to 0 in browser-tab mode; it matters in
  standalone (section 10).
- `body { overscroll-behavior: none }`; every scroller sets `overscroll-behavior: contain` and
  `touch-action: pan-y`. Only one vertical scroller per screen (list, editor body, sheet body).

---

## 3. Navigation

### 3.1 Compact: 3-tab bottom bar (D1)

- `<nav aria-label="Primary">`, in-flow at the bottom, `h-14` (56px) + safe-area padding,
  `bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700`.
- Three `<button>` destinations, each `flex-1 min-h-[48px]` full height tappable: Notes
  (`FileText`), Tasks (`CheckSquare`), Search (`Search`). Icon `w-6 h-6`, label `text-[11px]
  font-medium` under it. Active: `text-blue-600 dark:text-blue-400` plus a 56x28 pill behind the
  icon `bg-blue-100 dark:bg-blue-900/40 rounded-full`; `aria-current="page"`. Inactive:
  `text-gray-500 dark:text-gray-400`.
- Hidden (not rendered, no reserved space) while writing mode is active or while the quick-add
  input has focus with the keyboard visible.
- Launch tab: last used (`localStorage notez-last-tab`), default Notes until Pam answers Q5.

### 3.2 Medium: left rail (D3)

- `<nav aria-label="Primary">` `w-[72px] h-full flex flex-col items-center bg-white dark:bg-gray-800
  border-r border-gray-200 dark:border-gray-700 overflow-hidden`.
- Top: Notez mark 32px (`py-3`). Then the same three destinations as 3.1, each `w-14 h-14`
  (56px) icon + `text-[11px]` label, same active treatment.
- Bottom (`mt-auto pb-[env(safe-area-inset-bottom)]`): Notifications (`Bell` with unread badge
  `bg-red-600 text-white text-[10px]` top-right) and the avatar (32px circle, `bg-blue-600`
  initial, inside a 48px target). Avatar opens the avatar menu as a popover anchored to the rail.
- At 297px of height (keyboard open) the rail's bottom group is clipped by `overflow-hidden`
  rather than overlapping the destinations; the rail stays because it costs width, not height.

### 3.3 Stack model and back

Push (adds a history entry via `history.pushState`): editor open on Compact, Notifications page,
Settings list, Settings section, every sheet (`filter`, `details`, `task`, `task-menu`, `avatar`,
`chip-picker`), ShareDialog. Replace (no entry): tab switch, filter change, list scroll, task
selection on Medium, and opening Settings from the avatar menu (the menu's entry becomes the
Settings entry, so back from Settings returns to the tab, not to the menu). Writing mode is not an
entry.

Back (arrow in the top bar, or Android system back, both run the same `popstate` handler):

| State | Back does |
| --- | --- |
| Any sheet open | Closes the sheet, returns focus to the opener; underlying screen unchanged |
| Writing mode (keyboard open) | Android closes the keyboard itself first (no page event); writing mode exits by rule 5.3; a second back then acts on the editor |
| Editor (reading state), Compact | Closes the editor, returns to the list at its previous scroll position, focus on the note row that was open |
| Editor, Medium | Deselects the note (right pane shows the empty state); the list stays |
| Task sheet, Compact | Closes the sheet (unsaved new-task text discarded only if title is empty; otherwise the draft stays in the quick-add field) |
| Task detail pane, Medium | Deselects the task |
| Settings section page | Returns to the Settings list |
| Settings list, Notifications page | Returns to the tab that opened it |
| Tab root (list) | Leaves the app (standalone) or goes to the previous site (browser). Tabs are `replaceState` so the stack never fills with tab hops |

Deep links (`?note=`) keep working: the handler sets `noteId` and replaces the current entry, then
pushes an editor entry on Compact.

### 3.4 Where things live

| Item | Compact | Medium |
| --- | --- | --- |
| Folders / tags filter | Sheet opened from the title chip in the Notes top bar (4.3) | Same sheet, opened from the list pane title chip |
| Notifications | `Bell` in the top bar (Notes, Tasks); opens a pushed full-screen page with back arrow | `Bell` at the rail bottom; existing popover |
| Theme toggle | Avatar menu (Light / Dark / System segmented control) and Settings > Appearance | Same |
| Settings | Avatar menu entry; pushes the Settings list (section 8) | Avatar menu entry; renders in the main region |
| Avatar menu | Avatar (32px in a 48px target) at the left of every top bar; opens a bottom sheet: username header, Theme segmented, Settings, What's New, Sign out. Each row `min-h-[48px]` | Rail bottom avatar; popover with the same rows |
| Search | Search tab (section 7) | Search rail destination |
| New note | FAB (4.4) | FAB in the list pane |
| New task | Quick-add bar (6.6) | Quick-add bar in the agenda pane |

Top bar (Compact, list screens): `h-14` + safe-area top, `px-2`, `bg-white dark:bg-gray-800
border-b border-gray-200 dark:border-gray-700`. Left: avatar button. Centre-left: title chip.
Right: `Bell` (48px target). Icons `w-5 h-5`, text `text-gray-700 dark:text-gray-200`.

---

## 4. Notes list on Compact

### 4.1 Row anatomy

`<button class="w-full text-left px-4 py-3 min-h-[64px] border-b border-gray-100 dark:border-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700">`

```
[icon 16] Title (text-[15px] leading-5 font-medium text-gray-900 dark:text-white, truncate)    2h ago (text-xs text-gray-500 dark:text-gray-400, shrink-0)
          Preview text, one line (text-sm text-gray-500 dark:text-gray-400 line-clamp-1)
          [Folder chip] [tag] [tag] (text-xs; row omitted when empty)
```

- Icon: `FileText text-gray-400` (own note), `Files text-blue-500` (shared), `Bot text-purple-500`
  (service account), `Trash2 text-gray-400` (trash). Shared rows add "by Jo, edit" in
  `text-xs text-blue-600 dark:text-blue-400` under the title.
- Folder chip only when the active filter is not that folder (All notes, Unfiled, tag views).
  Max 2 tags, `+n` overflow. Chip: `px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700
  text-gray-600 dark:text-gray-300`.
- Selected row (Medium only): `bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-600`.
- Drag-to-folder (HTML5 DnD) is desktop only; on Compact and Medium a note is moved from the
  Details sheet folder row.

### 4.2 Preview text (shared fix, D9)

`previewText(content, 120)`: strip HTML tags, then markdown syntax (`#`, `*`, `_`, `>`, backticks,
`- [ ]`, link brackets keeping the label, image syntax removed), collapse whitespace, trim, cut at
120 chars on a word boundary. Used by NoteList on every layout and by Search results. Empty result:
row shows "No content" in `italic text-gray-400`.

### 4.3 Title chip and filter sheet

- The list title is a button: `[Folder icon] All notes [ChevronDown]`, `h-11 px-3 rounded-lg
  text-lg font-semibold`, `aria-haspopup="dialog"`, `aria-label="Filter notes, currently All notes"`.
  Filtered by folder: the folder's icon and name; by tag: `Tag` icon + name. A 44px `X` button
  "Clear filter" appears to the right when a filter is active.
- Filter sheet (`role="dialog"`, title "Notes"): three sections, each a `<h3 class="px-4 pt-4 pb-1
  text-xs font-semibold uppercase tracking-wide text-gray-500">`:
  - Views: All notes (`Folder`), Unfiled (`Inbox`), Shared with me (`Users`), My shares
    (`Share2`), Trash (`Trash2`), Service Accounts (`Bot`, admin only). Rows `min-h-[48px] px-4`,
    count on the right in `text-xs text-gray-500`.
  - Folders: each folder row with its icon and count; trailing `MoreVertical` 44px button opens
    rename / change icon / delete (existing EditableListItem behaviour). Last row "New folder"
    (`FolderPlus`, `text-blue-600`).
  - Tags: wrapped chips `h-9 px-3 rounded-full`, same tokens as 4.1 chips; selected
    `bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`.
  - Selecting any item closes the sheet, applies the filter, scrolls the list to top. Current item
    has `aria-current="true"` and a `Check` icon.

### 4.4 New note action

FAB, not a top-bar button: `w-14 h-14 rounded-full bg-blue-600 dark:bg-blue-500 text-white
shadow-lg` with `Plus w-6 h-6`, `aria-label="New note"`, positioned `absolute right-4` and 16px
above the tab bar (`bottom-4` inside the list column, which already ends at the tab bar).
Reason: the bottom-right corner is inside the one-handed thumb zone; the top bar is the hardest
reach on a 6.8" phone, and the bottom bar is navigation, not creation. The list has
`pb-24` (96px) so the last row is never under the FAB (audit 2.5). Hidden in Trash, Shared with
me, My shares, Service Accounts. Creating a note opens the editor with the title selected (existing
behaviour) and pushes a history entry.

### 4.5 States

Loading: 6 skeleton rows (`animate-pulse bg-gray-100 dark:bg-gray-700 rounded h-4`). Empty per
view: existing copy, centred, `text-sm text-gray-500`, plus the FAB hint "Tap + to create one"
where creation is allowed. Error: inline banner `bg-red-50 dark:bg-red-900/20 text-red-700
dark:text-red-300` with a "Retry" button. Long titles truncate; 0-tag and 0-folder rows drop line 3.

---

## 5. Editor (D2)

### 5.1 Reading state (keyboard closed), Compact

```
Top bar h-14: [Back 48px] [Title input flex-1, text-lg font-semibold, single line] [Presence avatars] [Details 48px]
Meta strip h-9: [Folder chip] [tag] [tag] [+ tag]   (horizontal scroll, no wrap; tap any = Details sheet at that field)
Banner (only when relevant) h-8 text-xs: "View only, shared by Jo" / "Shared, you can edit" / "In trash. Restore to edit"
Editor body: flex-1 min-h-0, the only scroller
Tab bar h-14
```

- Back: `ArrowLeft`, `aria-label="Back to notes"`. Details: `MoreVertical`,
  `aria-label="Note details"`, `aria-haspopup="dialog"`.
- Title: `bg-transparent border-0 focus:ring-0 placeholder:text-gray-400`, `enterkeyhint="next"`
  (Enter moves focus to the body). Disabled when read-only (`opacity-60`).
- Save status is not in the bar. It lives in the Details sheet header and as a toast only on
  failure (existing behaviour). Collaborative notes show "Live" there instead.
- Body: `.ProseMirror { font-size: 1rem; line-height: 1.6; padding: 16px 16px 50vh }` on Compact
  (large bottom padding so the last line can scroll above the strip). Focus ring stays the inset
  blue glow.
- Presence (collaborative notes): up to 3 avatars 24px, overlapping `-space-x-2`, each
  `border-2 border-white dark:border-gray-800` with the user's cursor colour; `+n` chip beyond 3;
  `aria-label="Also editing: Jo, Sam"`. Writing mode shrinks them to 20px.

### 5.2 Writing mode (keyboard open), Compact

```
Top bar h-11: [Done 48px, Check icon] [Title input, text-base, truncate] [Presence] [Details 48px]
Editor body: flex-1 (the keyboard-aware root has already shrunk)
Formatting strip h-11: horizontal scroll of 44x44 buttons
(keyboard)
```

Budget at the measured 411 x 351 (cover screen, keyboard open): title bar 44 + strip 44 = 88px of
chrome, 263px of editor, about 10 lines at 16px / 1.6. Neither bar may grow: no second row, no
banner, no meta strip, no tab bar in this state.

Hidden in writing mode: tab bar, meta strip, banner (except trash and view-only, which block
editing anyway, so writing mode cannot start there). Nothing animates height; the strip appears
with `opacity` 150ms only (no transform), so there is no layout jump on keyboard open or close.

### 5.3 Entering and leaving writing mode

Enter when BOTH: an editor field (title or body) has focus AND the keyboard is visible (2.2).
Leave when EITHER: the keyboard hides (`--kb-inset` back under 120px, or `innerHeight` restored)
OR focus leaves both fields. Hardware keyboard on the Fold or a desktop: focus without a visible
keyboard keeps the reading layout; the formatting strip still shows when the body has focus (it is
useful without a soft keyboard too). "Done" calls `editor.commands.blur()`, which closes the soft
keyboard on Android and therefore exits writing mode. Applies on Compact and Medium alike (5.8).

### 5.4 Formatting strip

`<div role="toolbar" aria-label="Formatting" class="h-11 flex items-center overflow-x-auto
bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-1 gap-0.5
snap-x">`. Each button `w-11 h-11 rounded-md snap-start`, icon `w-5 h-5`, `aria-label`,
`aria-pressed` for toggles; active `bg-blue-100 dark:bg-blue-900/40 text-blue-600
dark:text-blue-400`, inactive `text-gray-700 dark:text-gray-200`.

Order (most used first, left is reachable without scrolling at 360px: 8 buttons visible):
Undo, Redo | Bold, Italic, Strikethrough | Bullet list, Numbered list, Task list | Heading 1,
Heading 2 | Blockquote, Code block, Link, Image. Dividers `w-px h-6 bg-gray-200 dark:bg-gray-700`.
13 buttons = 572px, so the strip scrolls on Compact and fits on the Fold inner pane; the title
bar's Done button is the keyboard dismiss, so nothing is pinned at the strip's right edge. Link
opens a small sheet (URL field); Image opens the file picker (existing upload path). Raw markdown
mode: strip hidden.

Arrow keys move between toolbar buttons (roving tabindex); Tab leaves the toolbar back to the editor.

### 5.5 Details sheet (`role="dialog"`, `aria-labelledby` = note title)

Rows `min-h-[48px] px-4`, in this order:

1. Header: note title (truncate), status line `text-xs text-gray-500`: "Saved just now" /
   "Saving" / "Live (shared)" / "Read only"; Close `X` 48px.
2. Folder: `Folder` icon, folder name or "No folder", `ChevronRight`; opens a folder picker sheet
   (Views excluded, single select, "No folder" first, `aria-current`). Owner only.
3. Tags: existing `TagInput`, chips + add field, `enterkeyhint="done"`.
4. AI actions: three chips `h-9 px-3 rounded-full text-sm` with `Sparkles` prefix: Summarize,
   Suggest title, Suggest tags; disabled when the note is empty; loading shows a spinner and the
   row is `aria-busy`. Colours as today (purple/blue/green pills), both themes.
5. Share (owner only): `Share2`, "Not shared" or "Shared with 2 people", `ChevronRight`; opens
   ShareDialog as a full-height sheet on Compact.
6. View: `Code` icon, "Raw markdown" with a switch (`role="switch" aria-checked`). On Compact,
   raw mode renders a `<textarea class="font-mono text-sm">` rather than Monaco (see Design notes).
7. Markdown help: `HelpCircle`, opens the existing MarkdownHelp as a sheet.
8. Info (static, `text-xs text-gray-500`): words, characters, created, updated, owner when shared.
9. Danger: "Move to trash" `text-red-600 dark:text-red-400` with `Trash2`; confirm dialog as
   today, then toast "Moved to trash" with Undo (calls restore). In trash: "Restore" primary
   button and "Delete forever" danger (confirm dialog, no undo).

Medium: same sheet content as a centred dialog `max-w-md`, `max-h-[92%]` of the keyboard-aware
root so it still fits in 297px.

### 5.6 Scroll behaviour (requirements for D10 and the build plan)

- The editor body (`.tiptap-wrapper`, and the collaborative editor's own scroller) is the only
  vertical scroller on the screen; the page never scrolls (`#root` is `h-[100dvh] overflow-hidden`).
- Caret always visible above the strip: TipTap `editorProps: { scrollThreshold: { bottom: 64 },
  scrollMargin: { bottom: 64 } }` plus `scroll-padding-bottom: 64px` on the scroller.
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
failure: banner "Reconnecting" `bg-amber-100 dark:bg-amber-900/30`.

### 5.8 Writing mode on Medium (Fold inner, keyboard open)

Measured: 841 x 297 visible. Height is the scarce axis, width is not, so:

- Rail and list pane stay. They cost width only; collapsing them would reflow the editor on every
  keyboard open and close (a layout jump on the axis the user is reading) for no height gain.
- The editor pane enters writing mode exactly as on Compact (5.2): title bar `h-11`, meta strip
  and banners hidden, strip `h-11` docked at the bottom of the pane. Budget: 297 - 88 = 209px of
  editor, about 8 lines. The 13-button strip (572px) fits the 449px-wide pane only with scroll at
  `md`; at `lg` it fits without. Acceptable.
- The list pane keeps its own scroller and shrinks with the root; its FAB stays at `bottom-4` of
  the (shorter) pane. The quick-add bar on the Tasks pane behaves the same way.
- Sheets and dialogs on Medium are `max-h-[92%]` of the root, so a 297px root gives a 273px
  dialog with internal scroll. The task sheet's title field is the first thing inside, so the
  keyboard-open case still shows the field being edited.
- Entering and leaving follow 5.3 (focus + keyboard visible). Rotating the inner screen to
  portrait (701 x 841) with the keyboard open gives roughly 701 x 400 visible: same rules, more
  room.

---

## 6. Tasks agenda (D4)

### 6.1 Structure (Compact)

```
Top bar h-14: [Avatar] Tasks [Bell]
Scrollable column (one scroller):
  Search row: input h-11 "Search tasks" (Search icon, clear X), scrolls away with the list
  Chips row h-10: [Priority] [Folder] [Tag] [Show completed]   (horizontal scroll)
  Group: OVERDUE (sticky header h-9) rows...
  Group: TODAY rows...
  Group: UPCOMING rows... (each row's due chip shows weekday or date)
  Group: NO DATE rows...
  Group: COMPLETED (collapsed by default, header shows count)
  pb-4
Quick-add bar h-14 (in flow, above the tab bar)
Tab bar h-14
```

Search is local to the agenda (title, description, tag names), debounced 200ms, filters rows in
place and keeps grouping. Chips: `h-9 px-3 rounded-full border border-gray-300 dark:border-gray-600
text-sm text-gray-700 dark:text-gray-200`; active `bg-blue-100 dark:bg-blue-900/40 text-blue-700
dark:text-blue-300 border-blue-300 dark:border-blue-700` and the chip label becomes the value
("High", "Garden", "#plants"). Priority, Folder and Tag chips open a single-select picker sheet
(radio list, "Any" first). "Show completed" is a toggle chip (`aria-pressed`). Active filters are
summarised for screen readers in a visually hidden `aria-live="polite"` line ("Showing 7 tasks,
filtered by High priority").

Group headers: `sticky top-0 h-9 px-4 flex items-center gap-2 text-xs font-semibold uppercase
tracking-wide bg-white dark:bg-gray-900`, count badge `rounded-full px-1.5 text-[11px]`. Colours:
Overdue `text-red-600 dark:text-red-400`, Today `text-amber-600 dark:text-amber-400`, Upcoming and
No date `text-gray-500 dark:text-gray-400`, Completed `text-green-600 dark:text-green-400`. Header
is a button (`aria-expanded`) that collapses the group; collapsed state persists in
`notez-agenda-collapsed`. Empty groups are omitted, except Today, which shows "Nothing due today"
in `text-sm text-gray-400 px-4 py-3` so the morning review has an explicit answer.

Sort inside a group: due date ascending, then priority (Urgent first), then title. Grouping uses
the local calendar day. In-progress tasks stay in their date group (status is not a time) and are
marked on the row (6.2); there is no In Progress group.

### 6.2 Row anatomy

```
<div role="listitem" class="relative select-none" style="touch-action: pan-y">
  underlay: absolute inset-0 bg-green-600 flex items-center pl-5 text-white (Check icon), revealed by swipe
  foreground: flex items-start min-h-[56px] bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 border-l-2 {priority accent}
    [complete button w-12 h-12 (48px)] [content flex-1 min-w-0 py-2 pr-3] [priority indicator]
```

- Complete button: `role="checkbox" aria-checked` with `aria-label="Mark complete: {title}"`.
  Glyph 22px: `Circle text-gray-400` (pending), `PlayCircle text-blue-600 dark:text-blue-400`
  (in progress, plus the words "In progress" in the meta line), `CheckCircle2 text-green-600
  dark:text-green-400` (done), `XCircle text-gray-400` (cancelled). Tap toggles pending <-> done
  (in-progress -> done; undo restores in-progress).
- Content: title `text-[15px] leading-5 font-medium text-gray-900 dark:text-white line-clamp-2`
  (done: `line-through text-gray-500`). Meta line `mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs
  text-gray-500 dark:text-gray-400`: due chip (`Clock` + "Tomorrow" / "Thu 16 Oct"; overdue
  `AlertCircle` + "2d overdue" in `text-red-600 dark:text-red-400 font-medium`; today "Today" in
  `text-amber-600 dark:text-amber-400 font-medium`), `Folder` + name, `#tag` x2 (+n), `FileText`
  + note title (truncate `max-w-[96px]`), `Link2` + count.
- Priority indicator (not a tap target, `aria-label` in the row text): Urgent = `ChevronsUp` red +
  "Urgent"; High = `ChevronUp` orange + "High"; Low = `Minus` gray + "Low"; Medium shows nothing
  (default). Shape plus word, so colour is never the only signal; the left accent border
  (`border-l-red-500`, `border-l-orange-400`, `border-l-blue-400`, `border-l-gray-300`) is a
  redundant cue.
- The whole foreground is a `<button>` (title area) that opens the task sheet; its accessible name
  is the title plus due text.
- Row tap target: 56px tall minimum; a 2-line title makes 76px.

### 6.3 Swipe right to complete

- Pointer events on the foreground: `pointerdown` records start; a gesture is horizontal if
  `|dx| > 10 && |dx| > |dy|` within the first move, otherwise it is a scroll and the row ignores it.
  Only `dx > 0` moves the row (left swipe does nothing, D6). Foreground `translateX(dx)` capped at
  row width; underlay `Check` icon scales from 0.6 to 1 past the threshold.
- Threshold: `max(96px, 40% of row width)`. Past it on release: row animates off (150ms), status
  becomes COMPLETED (optimistic), row moves to the Completed group, undo toast (6.4). Below: snap
  back 150ms. Reduced motion: no translate animation, instant.
- Alternatives: the 48px complete button; the task sheet status control; the long-press menu.

### 6.4 Undo toast

`role="status" aria-live="polite"`, bottom of the tasks column above the quick-add bar (in flow
overlay `absolute bottom-16 inset-x-3`), `bg-gray-900 dark:bg-gray-700 text-white rounded-lg
shadow-lg px-4 min-h-[48px] flex items-center`: "Completed: Buy compost" and an "Undo" button
(`text-blue-300 font-semibold min-h-[44px] px-3`). 5s, pausing on focus/hover. Undo restores the
previous status (PENDING or IN_PROGRESS), not just PENDING. The same toast serves delete
("Deleted: Buy compost", Undo) and note trash. Only one toast at a time; a new one replaces the old
after committing it.

### 6.5 Long-press menu (quick actions)

Trigger: 500ms press without movement > 10px (pointer events, plus `contextmenu` prevented on
touch). Opens a bottom sheet (`role="dialog"`, labelled by the task title). Rows:

- Status: 4-segment control (`role="radiogroup"`): Pending, In progress, Done, Cancelled, each
  `min-h-[48px]`, icon above an 11px label (stacked so all four fit at 360px without truncation).
- Priority: 4 chips Low / Medium / High / Urgent (`role="radiogroup"`).
- Due: shortcut chips Today, Tomorrow, Next week, Pick date (native `<input type="date">`), Clear.
- "Open details" row (`ChevronRight`) opens the task sheet.

No delete here (D6). Every change applies immediately and closes the sheet (status, due) or stays
open (priority, so a second tap is possible). Keyboard users: the row is focusable; `Shift+F10`
or the context-menu key opens the same sheet; screen readers reach everything through the task
sheet.

### 6.6 Quick-add bar

`<form class="h-14 px-3 flex items-center gap-2 border-t border-gray-200 dark:border-gray-700
bg-white dark:bg-gray-800">`: `Plus` icon 20px `text-blue-600`, input `flex-1 h-11 text-base
bg-gray-100 dark:bg-gray-700 rounded-lg px-3` placeholder "Add a task", `enterkeyhint="done"`,
`aria-label="New task, type a title; words like tomorrow, !high and #tag are understood"`, and an
expand button `SlidersHorizontal` 44px `aria-label="More options"` that opens the task sheet
pre-filled with the parse.

- In flow above the tab bar. On focus with the keyboard visible: tab bar hides, the bar sits
  directly above the keyboard (keyboard-aware root), and a preview row `h-9 px-3 flex gap-1.5
  overflow-x-auto` appears above the input showing parse chips (or the hint "Try: tomorrow,
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

Not parsed: numeric `14/10` (locale ambiguity, see Design notes), times, folders. Chip colours:
date `bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300`; priority uses the priority
badge tokens (4.3 of the design language); tag `bg-gray-100 dark:bg-gray-700`. Each chip has an
`X` (28px visual, 44px hit area) "Keep as text": removing the chip puts the token back into the
title literally, so a title that genuinely contains "#" or "tomorrow" is possible. A visually
hidden live region reads "Understood: due Tomorrow, High priority" when chips change (throttled to
once per second). Due dates are local midnight (see Design notes on the UTC bug).

### 6.8 Task sheet (editor)

Compact: bottom sheet `max-h-[92%]` with drag handle (`w-10 h-1 rounded bg-gray-300` visual
only), `role="dialog" aria-modal="true" aria-labelledby="task-sheet-title"`, body scrolls. Medium:
the right pane with the same content and a `Close` button, no handle.

Header: Close `X` (48px, left), "Task" / "New task" (`text-base font-semibold`), right: "Add"
primary button (new task only, disabled until the title is non-empty).

Fields in order (labels `text-xs font-medium text-gray-500 dark:text-gray-400 mb-1`):

1. Title: `<input class="w-full text-base font-medium h-11 ...">`, autofocus for new tasks,
   `enterkeyhint="done"`.
2. Status: 4-segment control as in 6.5.
3. Priority: 4 chips as in 6.5.
4. Due: shortcut chips (Today, Tomorrow, Next week, Pick date, Clear) + the current value as text.
5. Folder: row with `Folder` icon, value, `ChevronRight`; opens the folder picker sheet.
6. Tags: `TagInput`.
7. Linked note (only when `noteId`): read-only row `FileText` + title, tap opens the note (closes
   the sheet, pushes the editor).
8. Links: list of `url` rows with `ExternalLink`; "Add link" opens two fields (URL, title); max 10.
9. Description: `<textarea>` auto-growing, `text-sm`, min 3 rows.
10. Danger zone: "Delete task" `text-red-600 dark:text-red-400 min-h-[48px]` with `Trash2`.

Save model: editing an existing task applies each field immediately (status, priority, due, folder,
tags, links: on change; title and description: 800ms after the last keystroke and on blur/close),
optimistic with rollback and error toast. There is no Cancel for edits; the sheet is a view of the
task, Close just closes. New task: nothing is sent until "Add" (or Enter in the title), so Close
discards. Delete: immediate optimistic removal, undo toast per 6.4; the build plan chooses delayed
commit (client holds the request 5s) or soft delete (D6).

### 6.9 Medium: agenda + detail

Left pane: the agenda (6.1) with the quick-add bar; right pane: the task sheet content as a panel,
or the empty state "Select a task, or add one below" with the `CheckSquare` icon. Selecting a row
replaces the detail (no history entry). The kanban view stays desktop only (D7); Medium has no
view toggle.

### 6.10 States

Loading: 8 skeleton rows grouped under Today. Empty (no tasks at all): illustration-free copy
"No tasks yet. Add one below." pointing at the quick-add bar. Empty after filters: "No tasks match"
with a "Clear filters" button. Offline/error: banner with Retry; optimistic changes that fail roll
back with an error toast.

---

## 7. Search tab

- Header: input `h-12 text-base` with `Search` icon, clear `X` (44px), autofocus when the tab is
  opened by tap (not on app launch), `enterkeyhint="search"`, `aria-label="Search notes and tasks"`.
  Scope chips under it: All, Notes, Tasks (`role="radiogroup"`, default All, persisted).
- Empty query: "Recent searches" list (last 8, `localStorage notez-recent-searches`), each row
  `min-h-[48px]` with `History` icon, the query, and a trailing 44px `X` "Remove"; "Clear all" link.
  Below it a hint line: "Search titles, content, tags and task names".
- Query >= 2 chars, debounced 300ms: one request to notes search and one to tasks search in
  parallel (the existing notes `search` param; tasks need `search` support, see Design notes).
  Results in two groups with sticky headers "Notes (n)" and "Tasks (n)":
  - Note row: 4.1 anatomy with the matched snippet (first match, 20 chars either side) and
    `<mark class="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded-sm">` highlights.
  - Task row: 6.2 anatomy without swipe (complete button works), tap opens the task sheet over the
    Search tab.
- States: loading skeleton (3 rows per group), no results ("Nothing for 'compost'" plus the scope
  chips), error with Retry. Submitting (Enter) stores the query in recents.
- Medium: search in the left pane, result opens in the right pane (note editor or task panel).

---

## 8. Settings on Compact

Fixes audit 2.2 by design: the two-column settings layout becomes a list -> page push.

- Settings list page (pushed from the avatar menu): top bar `[Back] Settings`; rows `min-h-[56px]
  px-4 flex items-center gap-3` with icon `w-5 h-5 text-gray-500`, label `text-base`, optional
  value `text-sm text-gray-500` and `ChevronRight`. Sections (confirm the inventory against the
  current SettingsPage; the list is the union of what exists today): Profile (`User`), Appearance
  (`Palette`: theme), Security (`Shield`: password, sessions, Pocket ID), API tokens (`Key`),
  Webhooks (`Zap`), Notifications (`Bell`), AI (`Sparkles`), Import and export (`Download`),
  Admin (`Users`, admin only: users, service accounts), About (`Info`: version, What's New).
- Section page: `[Back] {Section}` top bar, content `px-4 py-4 max-w-xl`, forms stacked
  (`space-y-4`), inputs full width `h-11`, primary buttons full width on Compact. Each section is a
  history entry; back returns to the list.
- Medium and Expanded: the existing two-column layout, with the content column fixed to
  `flex-1 min-w-0` (the 0px bug) so it can never collapse; the Compact list/page split is purely a
  render branch on the layout class.

---

## 9. Touch, spacing, type, theming, accessibility

### 9.1 Targets and spacing

- Minimum 44x44 for every control; 48x48 for primary row actions (complete, back, Details, tab
  bar items, FAB 56). Icon buttons are `w-11 h-11` or `w-12 h-12` with the icon centred; never
  `p-1` on mobile.
- Horizontal padding 16px (`px-4`) for list rows and sheet content; 12px (`px-3`) inside bars.
  Minimum 8px between adjacent targets.
- One-handed zones on a 384x824 screen (right thumb): easy = bottom 45% and the right half;
  stretch = top-left. Primary actions (tabs, FAB, quick-add, swipe, complete button on the left of
  the row which is reachable because the thumb sweeps across) sit low; rarely used controls (avatar,
  Bell, Details) sit high.

### 9.2 Typography (Compact)

| Role | Class | px |
| --- | --- | --- |
| Top bar title | `text-lg font-semibold` | 18 |
| Row title | `text-[15px] leading-5 font-medium` | 15 |
| Body, inputs | `text-base` | 16 (also prevents input zoom on WebKit) |
| Meta | `text-xs` | 12, never smaller |
| Section labels | `text-xs font-semibold uppercase tracking-wide` | 12 |
| Editor body | `.ProseMirror { font-size: 1rem; line-height: 1.6 }` | 16 |

Respect user font scaling: use `min-h` not `h` on text rows, `line-clamp` for overflow, rem-based
sizes (Tailwind default), no fixed-height containers around wrapped text. The device check page
reads Pam's font scale (Q10); layouts are checked at 130%.

### 9.3 Dark mode per surface

| Surface | Light | Dark |
| --- | --- | --- |
| App background, lists | `bg-white` | `bg-gray-900` |
| Bars (top, tab, rail, quick-add) | `bg-white border-gray-200` | `bg-gray-800 border-gray-700` |
| Formatting strip, group headers | `bg-gray-50` | `bg-gray-900` |
| Sheets | `bg-white` | `bg-gray-800` |
| Sheet backdrop | `bg-black/50 backdrop-blur-sm` | same |
| Inputs | `bg-gray-100 text-gray-900` | `bg-gray-700 text-white` |
| Toast | `bg-gray-900 text-white` | `bg-gray-700 text-white` |
| Swipe underlay | `bg-green-600` | `bg-green-700` |
| Chips (neutral) | `bg-gray-100 text-gray-700` | `bg-gray-700 text-gray-200` |
| Chips (active) | `bg-blue-100 text-blue-700` | `bg-blue-900/40 text-blue-300` |

Shared fixes (D9): NoteList search input and TagInput get `bg-white dark:bg-gray-700 text-gray-900
dark:text-white border-gray-300 dark:border-gray-600`; Monaco theme follows the document class
(`vs-dark` when `.dark`).

### 9.4 Motion

Sheets: `translateY(100%) -> 0`, 200ms ease-out; toasts: existing `toast-in`; swipe snap 150ms;
strip opacity 150ms. All guarded by `@media (prefers-reduced-motion: reduce) { transition: none;
animation: none }` on the shared sheet/toast classes. No height animations anywhere.

### 9.5 Focus order and screen reader labels

- Tab bar and rail: `<nav aria-label="Primary">` with `<button aria-current="page">`; focus
  order: top bar (avatar, title chip, Bell), content, FAB, tab bar.
- Sheet: `role="dialog" aria-modal="true" aria-labelledby`; focus moves to the first interactive
  element (or the heading for informational sheets); Tab cycles inside; Escape and backdrop tap
  close; focus returns to the opener. Implement with the existing ConfirmDialog focus restoration
  pattern extracted into a `useFocusTrap` hook.
- Editor: Back, title, presence (group `aria-label`), Details, body (`role="textbox"
  aria-multiline="true"` is provided by ProseMirror), formatting toolbar (roving tabindex).
- Task row: complete checkbox (labelled with the title), row button (name = title + due + priority
  + "in progress" when set). Swipe and long-press have the button and sheet equivalents (6.3, 6.5).
- Quick-add: input label explains the grammar; chips are `role="listitem"` inside a
  `role="list" aria-label="Understood"`; each chip's remove button is labelled "Keep 'tomorrow' as
  text".
- Live regions: one polite region for toasts and list announcements ("Added", "Completed",
  filter summaries); never more than one message per second.
- Icon-only buttons always carry `aria-label`; decorative icons `aria-hidden="true"`.
- Contrast: all text pairs listed above are at least 4.5:1 (gray-500 on white is 4.6:1; gray-400
  on gray-900 is 7:1); amber-600 on white (4.6:1) is used for Today text, not amber-500. A human
  check against rendered pixels is still required for the chips on blue-100 and the green underlay.

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
2. Due date timezone: `TaskForm` sends `${date}T00:00:00.000Z` (UTC midnight). Agenda grouping is
   by local day, so for users east of UTC a task due "today" can land in "Overdue" at 00:00 local.
   Recommend storing local midnight (send the local ISO with offset) or a date-only field; needs
   an API decision before 6.1 is built.
3. Tasks search endpoint: the Search tab and the agenda search assume `GET /api/tasks?search=`.
   Confirm it exists; if not, the agenda filters client-side (100-task page) and the Search tab
   needs the endpoint.
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
    it against `SettingsPage.tsx` before building the list.
12. Note delete gets an Undo toast (restore API exists); task delete undo depends on the D6 build
    decision (delayed commit vs soft delete).
13. Medium writing mode keeps the rail and list pane (5.8). If Adam finds 209px of editor on the
    unfolded Fold too tight in practice, the fallback is to hide the list pane while the keyboard
    is open (not the rail), which buys nothing vertically but widens the strip so it no longer
    scrolls; it does not help height. The real lever is the keyboard itself (Gboard's floating or
    compact modes), which the device check page should record.

# Notez Design Language

> Visual and interaction conventions used across the Notez SPA. Sibling document to `architecture.md`. The intent is descriptive, not prescriptive: it captures what is in the codebase today so contributors can extend it consistently.

---

## 1. Voice & Posture

Notez is a focused, self-hosted thinking tool. The UI gets out of the way of writing: a calm three-pane layout, neutral chrome, a single accent color, and dense but readable typography. Surfaces are flat with light shadow used only to lift modals and toasts above content. Animation is subtle and reduced-motion aware.

Three things the UI consistently optimizes for:

1. **Editor presence.** The note canvas is the protagonist on every screen.
2. **Predictable structure.** Folders, tags, notes, tasks are surfaced in the same order across sidebar, kanban, and dialogs.
3. **Status legibility.** Task status, share permission, agent attribution, and online presence all use stable color and icon pairings.

---

## 2. Identity

- **Name.** "Notez" with a capital N. Always rendered alongside the square mark when used as a logo.
- **Mark.** The square `notez-icon-*.png` set lives in `frontend/public/`; favicons (16/32) and an Apple touch icon (192) are wired in `frontend/index.html`. Source assets are in `docs/branding/` (`notez-sq.png`, `notez-sq-444k.png`, `notez-sq-sm.png`, plus 16/32/192 raster exports).
- **App header.** The mark sits at 32px next to a `font-bold text-lg md:text-xl` wordmark: this pair is the canonical lockup.

```tsx
// frontend/src/components/AppHeader.tsx
<a href="/" className="flex items-center space-x-2 md:space-x-4 hover:opacity-80 transition-opacity">
  <img src="/icon-192x192.png" alt="Notez" className="w-8 h-8" />
  <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Notez</h1>
</a>
```

---

## 3. Theming

### 3.1 Strategy

Tailwind's `darkMode: 'class'` strategy is used. The class lives on `<html>` and is set by an inline script in `frontend/index.html` **before React mounts**, to prevent flash-of-unstyled-content on hard refresh:

```html
<script>
  (function() {
    const theme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (theme === 'dark' || (!theme && prefersDark)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.add('light');
    }
  })();
</script>
```

`ThemeContext` (`frontend/src/contexts/ThemeContext.tsx`) reads the initial value from the document class, persists changes to `localStorage.theme`, and listens to `prefers-color-scheme` only when the user has not made an explicit choice.

### 3.2 Surfaces

| Role | Light | Dark |
| --- | --- | --- |
| Page background | `bg-white` / `bg-gray-50` | `bg-gray-900` / `bg-gray-950` |
| Card / panel | `bg-white` | `bg-gray-800` |
| Subtle panel (sidebar fill) | `bg-gray-50` / `bg-gray-100` | `bg-gray-900` / `bg-gray-900/50` |
| Border | `border-gray-200` | `border-gray-700` |
| Hover wash | `hover:bg-gray-100` | `hover:bg-gray-700` |
| Modal backdrop | `bg-black/50 backdrop-blur-sm` | (same) |
| Toast (mobile, below `xl`) | `bg-green-700` / `bg-amber-700` / `bg-red-700` / `bg-blue-700`, `text-white` | (same) |

Every surface that renders text pairs a light and a dark token (e.g. `text-gray-900 dark:text-white`, `text-gray-600 dark:text-gray-400`). The typical text scale is gray-900 / gray-700 / gray-500 in light, and white / gray-300 / gray-400 in dark.

### 3.3 Scrollbars

Custom thin scrollbars are defined in `frontend/src/index.css` for both Webkit and Firefox, with a separate dark-mode rule. They are 6px, transparent track, 40% opacity neutral thumb that lifts to 60% on hover.

---

## 4. Color System

Notez does not extend Tailwind's palette: the theme uses Tailwind defaults. The semantic mapping below is what's actually applied across the codebase.

### 4.1 Brand / primary action

`blue-600` (light) / `blue-500` (dark) is the primary action color. Hover deepens to `blue-700`. Backgrounds and pills use `blue-100 / blue-900/40`. This is the color of submit buttons, "Save", "Sign in", primary toolbar actions, and the `default`-variant confirm button.

```
bg-blue-600 dark:bg-blue-500 hover:bg-blue-700  text-white
bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400
```

The Tiptap editor focus ring is the same blue, applied as an inset shadow rather than an outline:

```css
/* frontend/src/components/TiptapEditor.css */
.tiptap-wrapper .ProseMirror:focus       { box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.3); }
.dark .tiptap-wrapper .ProseMirror:focus { box-shadow: inset 0 0 0 2px rgba(96, 165, 250, 0.3); }
```

### 4.2 Status semantics

A small palette of secondary colors is used consistently for status; they are the same on the kanban board, in toasts, and in confirm dialogs.

| Meaning | Hue | Light surface | Light text | Dark surface | Dark text |
| --- | --- | --- | --- | --- | --- |
| Success / completed | green | `bg-green-50` / `bg-green-600` | `text-green-600` (mobile: `text-green-700`) | `bg-green-900/20` / `bg-green-700` | `text-green-400` |
| Warning / caution | amber / yellow | `bg-amber-100` / `bg-yellow-500` | `text-amber-600` (mobile: `text-amber-700`) | `bg-amber-900/30` / `bg-yellow-600` | `text-amber-400` |
| Danger / destructive | red | `bg-red-100` / `bg-red-600` | `text-red-600` (mobile: unchanged) | `bg-red-900/30` / `bg-red-700` | `text-red-400` |
| Info / neutral progress | blue | (see primary) |  |  |  |
| Neutral / pending | gray | `bg-gray-50` / `bg-gray-100` | `text-gray-600` | `bg-gray-900/50` / `bg-gray-700` | `text-gray-400` |

Mobile surfaces (below `xl`) use the -700 light text shades for success and warning: `-600` fails WCAG 1.4.3 on white (green-600 3.3:1 -> green-700 5.0:1; amber-600 3.2:1 -> amber-700 4.8:1). Danger keeps `text-red-600` (4.8:1, passes); red-700 is used wherever white text sits on a red surface (toasts). Dark text stays the -400 shades. Desktop still uses the -600 shades until the sweep in known issue #73.
### 4.3 Task priority palette

`KanbanBoard.tsx` defines the canonical priority colors. Other surfaces (task list items, task form, notifications) reuse the same hues.

| Priority | Border accent | Badge |
| --- | --- | --- |
| LOW | `border-l-gray-400` | `bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400` |
| MEDIUM | `border-l-blue-400` | `bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400` |
| HIGH | `border-l-orange-400` | `bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400` |
| URGENT | `border-l-red-500` | `bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400` |

Mobile surfaces (below `xl`) change the light badge text to the -700 shades (`text-gray-700`, `text-blue-700`, `text-orange-700` (3.6:1 -> 5.2:1), `text-red-700`) and the border accents to MEDIUM `border-l-blue-500` and HIGH `border-l-orange-500`; LOW (`gray-400`) and URGENT (`red-500`) are unchanged; dark badge text is unchanged. The orange-500 accent is 2.8:1 on white and fails 1.4.11 on its own. It stays because the accent is decorative: priority is identified by the icon and the word (for example "High" with `ChevronUp`), and the colour only reinforces them. No border colour is the sole cue anywhere on mobile. The table above is what desktop still uses (known issue #73).
### 4.4 Kanban columns

| Column | Icon | Surface | Header text |
| --- | --- | --- | --- |
| Pending | `Circle` | `bg-gray-50 dark:bg-gray-900/50` | `text-gray-600 dark:text-gray-400` |
| In Progress | `PlayCircle` | `bg-blue-50 dark:bg-blue-900/20` | `text-blue-600 dark:text-blue-400` |
| Completed | `CheckCircle2` | `bg-green-50 dark:bg-green-900/20` | `text-green-600 dark:text-green-400` |
| Cancelled | `XCircle` | `bg-red-50 dark:bg-red-900/20` | `text-red-600 dark:text-red-400` |

Mobile surfaces (below `xl`) use `text-blue-700`, `text-green-700` and `text-red-700` for the light header text; `text-gray-600` stays (7.6:1 passes) and dark text is unchanged. Desktop keeps the -600 headers shown above (known issue #73).
### 4.5 Collaboration cursors

A 12-color hand-curated palette in `backend/src/services/collaboration.service.ts` is hashed against the user's ID to give every participant a stable cursor color across sessions:

```
#FF6B6B  #4ECDC4  #45B7D1  #96CEB4
#FFEAA7  #DDA0DD  #98D8C8  #F7DC6F
#BB8FCE  #85C1E9  #F1948A  #82E0AA
```

The palette is intentionally **not** the Tailwind palette: collaboration cursors are a presentational concern of the editor, not a brand surface, and the curated set guarantees that any two simultaneous users get distinguishable hues even when their IDs hash close together (the previous HSL-from-hash approach failed on similar names like "adam" / "pam").

### 4.6 Agent accent colors

API tokens that represent agents (`ApiToken.isAgent`) carry their own `agentColor` (a 7-char hex like `#8B5CF6`). The frontend respects this color when rendering content created by the agent, so a service-account workspace can be distinguished at a glance from human-authored notes.

---

## 5. Typography

The font stack is set on `:root` in `frontend/src/index.css`:

```css
font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
line-height: 1.5;
font-weight: 400;
font-synthesis: none;
text-rendering: optimizeLegibility;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

Inter is loaded via the system if available; the fallback is platform-native sans. The site does not currently web-load Inter: the design assumes Inter is available locally on most modern OSes and falls back gracefully.

### 5.1 Scale

| Role | Tailwind | Notes |
| --- | --- | --- |
| Page H1 / wordmark | `text-lg md:text-xl font-bold` | Header lockup |
| Section title | `text-lg font-semibold` | Modal headings, settings sections |
| Card / list title | `text-sm font-medium` to `text-base font-semibold` | Note titles, task titles |
| Body | `text-sm` | Default in dialogs, settings, lists |
| Meta / muted | `text-xs` to `text-sm text-gray-500/400` | Timestamps, hints, counts |
| Editor body | Tiptap default (browser-rendered prose) | Editor uses ProseMirror styling, not Tailwind text utilities |
| Code / mono | Browser default `monospace` via Tiptap code block | Syntax highlighting via Tiptap `extension-code-block` |

### 5.2 Weight

`font-bold` is reserved for the wordmark and section headings. Buttons and titles use `font-medium` / `font-semibold`. Body copy is `font-normal`.

---

## 6. Spacing & Layout

Tailwind's default 4px scale is the unit. Common patterns:

- **Vertical rhythm in panels.** `space-y-2` between dense items (sidebar lists), `space-y-4` between form fields, `space-y-6` between settings sections.
- **Horizontal padding.** Buttons are `px-3 py-1.5` (compact) or `px-4 py-2` (standard). Cards/dialogs use `p-4` or `p-6`. The header is `px-4 py-3`.
- **Gaps in flex rows.** Toolbars use `space-x-2 md:space-x-4` so they tighten on mobile.
- **Icon-text gap.** `gap-2` is the default between a Lucide icon and its label.

### 6.1 The three-pane editor

`pages/EditorPage.tsx` is the dominant layout: a fixed-width folder sidebar, a fixed-width note list, and a flex-1 editor. Widths are configurable per-user with constrained min/max:

```
SIDEBAR_MIN = 180 / SIDEBAR_MAX = 400 / default 256
LIST_MIN    = 240 / LIST_MAX    = 500 / default 320 (computed)
SA_WORKSPACE_WIDTH = 520     // service-account workspace inner column
```

Widths are persisted to `localStorage` (`notez-sidebar-width`, `notez-list-width`). Drag-resize is implemented by `ResizeHandle` between panes.

### 6.2 Mobile behavior

The shell collapses to a single-pane stack with a `mobileView: 'sidebar' | 'list' | 'editor'` state. The kanban defaults to **list** below 1280px (`xl`) and **kanban** at or above. Toasts are anchored bottom-right with an `xl:bottom-4` override so they don't collide with the mobile bottom navigation (`bottom-20`).

---

## 7. Components

### 7.1 Buttons

A small set of conventions, no shared component yet:

- **Primary action**: `px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`. Add `flex items-center space-x-2` when paired with an icon.
- **Compact primary**: same hue, `px-3 py-1.5 text-sm`.
- **Destructive**: `bg-red-600 hover:bg-red-700 text-white`.
- **Ghost / icon-only**: `p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded`.
- **Disabled state**: always `disabled:opacity-50 disabled:cursor-not-allowed`.
- **Focus ring**: `focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500` on form-style buttons.

### 7.2 Inputs

Inputs use `border border-gray-300 dark:border-gray-600 rounded-md` with `bg-white dark:bg-gray-700` fills and `focus:ring-2 focus:ring-blue-500` accents. Helper text is `text-xs text-gray-500 dark:text-gray-400`. Error text is `text-xs text-red-600 dark:text-red-400`.

Mobile surfaces (below `xl`) use `border-gray-400 dark:border-gray-500` for the input border. The border is decorative: gray-400 on white is 2.5:1 and the `bg-gray-100` fill is 1.1:1, so neither identifies the field; inputs are identified by their visible label and placeholder, and by the focus ring when active. Where a boundary is the only cue (pending circle, checkbox outline, chips) the token is `gray-500` (4.8:1 light, 3.7:1 on gray-900, 3.0:1 on gray-800). Dark placeholders use `gray-300` on gray-700 (6.8:1). Desktop keeps `border-gray-300 dark:border-gray-600`.

### 7.3 Cards and panels

Cards live on a panel surface and use:

```
bg-white dark:bg-gray-800
border border-gray-200 dark:border-gray-700
rounded-lg
shadow-sm        // optional, used to lift cards above gray-50 backgrounds
```

Modals use a stronger shadow (`shadow-xl`) and an animated entrance (`animate-in fade-in zoom-in-95 duration-200`, see `ConfirmDialog.tsx`).

### 7.4 Confirm dialog variants

`useConfirm({ variant })` from `ConfirmDialog.tsx` exposes three variants: they are the canonical icon + color pairings used elsewhere too:

| Variant | Icon | Icon color | Confirm button |
| --- | --- | --- | --- |
| `default` | `AlertTriangle` | `text-blue-600 dark:text-blue-400` | `bg-blue-600 hover:bg-blue-700 text-white` |
| `warning` | `AlertTriangle` | `text-amber-600 dark:text-amber-400` | `bg-amber-600 hover:bg-amber-700 text-white` |
| `danger` | `Trash2` | `text-red-600 dark:text-red-400` | `bg-red-600 hover:bg-red-700 text-white` |

Each icon sits in a circular wash (`p-3 rounded-full bg-{color}-100 dark:bg-{color}-900/30`).

### 7.5 Toasts

`ToastProvider` (`frontend/src/components/Toast.tsx`) renders a fixed bottom-right stack capped at 5. Variants:

| Variant | Surface | Icon |
| --- | --- | --- |
| `success` | `bg-green-600 dark:bg-green-700` | `CheckCircle` |
| `error` (default) | `bg-red-600 dark:bg-red-700` | `XCircle` |
| `warning` | `bg-yellow-500 dark:bg-yellow-600` | `AlertTriangle` |
| `info` | `bg-blue-600 dark:bg-blue-700` | `Info` |

Mobile surfaces (below `xl`) use white text on -700 surfaces in both themes: success `bg-green-700` (white on green-600 is 3.3:1 and fails), warning `bg-amber-700` (4.8:1; white on yellow-500/600 is 1.9:1 / 2.4:1 and fails), error `bg-red-700` (red-600 passes at 4.8:1, red-700 adds margin), info `bg-blue-700` (6.7:1; blue-600 also passes at 5.2:1, -700 keeps the four toasts one family, as in the Surfaces row in 3.2 and the mobile spec 9.3). Desktop keeps the table above (known issue #73).

Toasts are `text-white text-sm`, `rounded-lg shadow-lg`, animate in with the custom `toast-in` keyframe (`tailwind.config.js`), and auto-dismiss after `duration` (default 5s). The container is `aria-live="polite"`.

### 7.6 Folder icons

`FolderIconPicker.tsx` exposes a curated subset of Lucide icons stored as **string names** in `Folder.icon` (default `"folder"`). The backend never serializes icon shapes, only names: the frontend resolves them to components at render time. This keeps the API stable and permits new icons without a migration.

### 7.7 Tags

Tags are pills with a neutral surface (`bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`). Selected/active tags lift to the brand blue. Tags and every other chip use one border token, `border-gray-500`, in both themes (mobile surfaces, below `xl`). The `TagInput` component supports inline create-on-enter and respects user ownership (a tag is unique per `(userId, name)`).

---

## 8. Iconography

- **Library.** `lucide-react` (`@^0.556.0`). One icon library across the entire SPA.
- **Default size.** `w-4 h-4` (small) inside buttons, `w-5 h-5` for navigation, `w-6 h-6` only inside the confirm-dialog wash. Editor toolbar buttons use `w-4 h-4`.
- **Color.** Icons inherit text color (`currentColor`); they do not carry their own color tokens. Status icons use the same hue as their surrounding text.
- **Status glyphs as control boundaries.** On mobile surfaces (below `xl`), status glyphs that act as control boundaries (pending circle, checkbox outlines) use gray-500 minimum in light mode.
- **Decoration vs meaning.** Decorative icons get `aria-hidden="true"`; meaningful icon-only buttons get `aria-label`.

A small reference of recurring icons:

| Concept | Icon |
| --- | --- |
| Note | `FileText`, `Files` |
| Folder | `Folder`, `FolderPlus` |
| Tag | `Tag` |
| Task list / kanban | `LayoutList`, `Columns`, `CheckSquare` |
| AI / agent | `Sparkles`, `Bot` |
| Share / collaborators | `Share2`, `Users` |
| Permissions / admin | `Shield` |
| Notifications | `Bell` (via `NotificationBell`) |
| Search | `Search` |
| Status (pending/in-progress/done/cancelled) | `Circle` / `PlayCircle` / `CheckCircle2` / `XCircle` |
| Destructive | `Trash2` |
| Caution | `AlertTriangle`, `AlertCircle` |
| Code / raw markdown | `Code` |
| Preview | `Eye` |

---

## 9. Editor Surfaces

The note editor is the largest single visual surface. It has two modes:

- **Formatted (Tiptap).** WYSIWYG markdown editing using the Tiptap starter kit + custom extensions (`CodeBlockExtension`, `WikiLinkExtension`, `TiptapImageExtension`, typography, link, task list, task item, placeholder).
- **Raw.** Monaco-based markdown editor with syntax highlighting, used as a fallback and for power users.

Mode is per-user / per-note state; the toolbar surfaces `Eye` (preview) and `Code` (raw) toggles. When a note is shared with edit permission and another collaborator joins, the editor swaps to `CollaborativeTiptapEditor`, which adds presence (`CollaborationPresence`) and cursors (`CollaborationCursors.css`). The collaborator chip is a circular avatar plus the user's hashed cursor color.

The Tiptap focus indicator is an inset blue glow rather than an outline: see §4.1. ProseMirror content gets `padding-bottom: 100px` so a long note has comfortable scroll-room past the last line.

Image uploads (drag, paste, file picker) go through `frontend/src/api/images.ts` → `POST /api/images` → MinIO. The returned URL is inserted as a Tiptap image node; `ResizableImage` provides drag handles for inline resize.

---

## 10. Motion

Tailwind defaults plus two custom keyframes (`tailwind.config.js`):

```js
keyframes: {
  'toast-in': {
    '0%':   { transform: 'translateX(100%)', opacity: '0' },
    '100%': { transform: 'translateX(0)',     opacity: '1' },
  },
},
animation: { 'toast-in': 'toast-in 0.2s ease-out' },
```

Other motion is via:

- `transition-colors` on hover-darkening buttons.
- `transition-opacity` on header / link hovers.
- `animate-in fade-in zoom-in-95 duration-200` for modal entrances.
- A `fadeIn` keyframe in `TiptapEditor.css` used to delay loading-state flashes on fast connections.
- A `prefers-reduced-motion` rule that flattens `fadeIn` to a no-op. Other animations should follow the same pattern when added.

Motion is intentionally short (≤ 200ms) and never blocks interaction.

---

## 11. Accessibility Patterns

- **Color contrast.** Body text against panel surfaces is gray-900-on-white / white-on-gray-900 (AAA). On mobile surfaces (below `xl`), muted text uses gray-500 (4.8:1) or darker on white and gray-400 (7.0:1) on gray-900; status text uses the -700 shades on white and the -400 shades on gray-900; every pair is listed in `docs/mobile/02-mobile-design-spec.md` section 9.5. Desktop muted text is still gray-600 / gray-400 (AA at the typical sizes) and desktop status text still uses -600 shades (known issue #73). Status pills double-encode meaning with an icon so color is never the only signal.
- **Focus restoration.** `ConfirmDialog` records `document.activeElement` on open and restores focus to it on close (`requestAnimationFrame` after unmount). Modals use `role="dialog" aria-modal="true" aria-labelledby="confirm-title"`.
- **Keyboard.** Form-style buttons carry the standard `focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`. Dialog Escape and backdrop click both cancel.
- **Reduced motion.** The Tiptap CSS handles its own `prefers-reduced-motion` block; other animations rely on Tailwind's default behavior (CSS animations respect the OS setting via the user-agent). On mobile surfaces: no height animations; sheets translate, strips fade.
- **Live regions.** Toasts are `aria-live="polite" aria-relevant="additions"`. Loading states use plain text or a spinner: never color alone.
- **Icon labelling.** Icon-only buttons must carry `aria-label`; decorative icons must carry `aria-hidden="true"`.

---

## 12. Naming & String Conventions

- **Storage keys.** App-owned localStorage keys are prefixed `notez-` (`notez-sidebar-collapsed`, `notez-task-view-mode`, `notez-sidebar-width`, `notez-list-width`, `theme`). Auth uses `accessToken` (no prefix, historical).
- **Token scopes.** API token scopes use a flat `resource:action` form (e.g. `notes:read`, `tasks:write`).
- **Webhook events.** `entity.action` (`note.created`, `task.updated`, `folder.deleted`); `["*"]` is the wildcard.
- **Icons.** Lucide names are stored verbatim as strings (`"folder"`, `"sparkles"`).
- **Routes.** API resources are plural (`/api/notes`, `/api/tasks`); singular paths name an action (`/api/auth/refresh`).

---

## 13. Extending the Language

When introducing a new surface or component:

1. **Reuse the palette.** Stick to the Tailwind defaults already in use: primary actions are blue-600/500, success is green-600/700, danger is red-600/700, warning is amber/yellow-500/600, info reuses primary blue. Don't introduce a new hue for a new feature. On white, status text is the -700 shade; on gray-900 the -400 shade.
2. **Pair every light token with a dark token.** Ship dark mode in the same PR.
3. **Use Lucide.** No new icon libraries.
4. **Keep `font-bold` rare.** Reach for `font-medium` / `font-semibold` first.
5. **Animate at most 200ms, and consider `prefers-reduced-motion`.**
6. **Encode status with both color and icon** (see Toast and Kanban patterns) so colorblind users still parse it.
7. **Persist layout choices in `localStorage` with the `notez-` prefix.**
8. **Authoritative copy lives in the component**, not in a separate i18n bundle (Notez is currently English-only).

When in doubt, search `frontend/src/components` for the closest existing pattern and match it: internal consistency is worth more than novelty.

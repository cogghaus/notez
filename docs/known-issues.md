# Known Issues and Future Fixes

This document tracks known issues identified through code reviews and testing that are deferred for future releases.

Last Updated: 2026-02-27

---

## BMad Method Framework Issues

The following issues were identified in the BMad Method framework files (`.bmad/`) during PR #39 code review. These are tracked for future consideration as they relate to third-party framework code:

### 1. File Path Wildcards in Instructions
**Location:** `.bmad/bmm/workflows/4-implementation/story-context/instructions.md`
**Issue:** Instructions reference file paths with wildcards (e.g., `docs/brownfield/*.md`) which may not be directly usable by all tools.
**Status:** Tracked - Framework limitation

### 2. Time Estimates in Workflow Instructions
**Location:** `.bmad/bmm/workflows/*/instructions.md`
**Issue:** Some workflow instructions contain time estimates (e.g., "should take 2-3 hours") which may set unrealistic expectations.
**Status:** Tracked - Documentation style consideration

### 3. Duplicate Step Numbers in Checklists
**Location:** Various checklist files
**Issue:** Some checklists have duplicate step numbers or inconsistent numbering.
**Status:** Tracked - Minor documentation issue

### 4. Grep Pattern Escaping
**Location:** Various instruction files
**Issue:** Some grep patterns may need proper escaping for special characters.
**Status:** Tracked - Usage consideration

---

## Application Issues

### 1. Focus Visibility (FIXED in v0.28.x)
**Location:** `frontend/src/components/TiptapEditor.css`
**Issue:** Original `outline: none` removed focus indicator for keyboard navigation.
**Fix:** Added visible focus styles with subtle inner box-shadow.
**Status:** ✅ Fixed

### 2. Mousewheel Scrolling (FIXED in v0.28.x)
**Location:** `frontend/src/components/TiptapEditor.tsx`, `TiptapEditor.css`, `NoteEditor.tsx`
**Issue:** Large notes didn't scroll properly with mousewheel.
**Fix:** Updated CSS container hierarchy and overflow properties.
**Status:** ✅ Fixed

---

## Deferred Review Findings (PR #130)

Identified during 4-agent code review of the contacts autocomplete feature. CRITICAL and HIGH findings were fixed immediately. The following MEDIUM/LOW items are deferred:

### 3. Share Dialog: No "No Results" State in Autocomplete Dropdown
**Location:** `frontend/src/components/ShareDialog.tsx`
**Issue:** When user types a query that matches no contacts, the dropdown simply hides. No feedback distinguishes "no matches" from "loading" or "broken."
**Severity:** MEDIUM
**Status:** Deferred — minor UX polish

### 4. Share Dialog: No Confirmation for Remove Share Action
**Location:** `frontend/src/components/ShareDialog.tsx`
**Issue:** Clicking the trash icon immediately removes a user's access with no undo or confirmation prompt. Mis-clicks are destructive.
**Severity:** MEDIUM
**Status:** Deferred — can re-share easily in a 2-10 user self-hosted context

### 5. Share Dialog: Form Row May Overflow on Very Narrow Viewports
**Location:** `frontend/src/components/ShareDialog.tsx`
**Issue:** The input + select + button row uses `flex` without wrapping. On screens narrower than ~360px, the text input may be squeezed to unreadable width.
**Severity:** MEDIUM
**Status:** Deferred — modal is max-w-md with mx-4, unlikely to hit in practice

### 6. Share Contacts: No Route-Specific Rate Limiting
**Location:** `backend/src/routes/shares.routes.ts`
**Issue:** The `/shares/contacts` endpoint relies on global rate limit (100 req/min). Autocomplete endpoints are inherently high-frequency. Could add a tighter per-route limit.
**Severity:** LOW
**Status:** Deferred — adequate for self-hosted 2-10 user environment

### 7. No Backend Unit Tests for `getSharedContacts`
**Location:** `backend/src/services/share.service.ts`
**Issue:** The new service function has no unit tests. No test infrastructure exists yet in the backend (no test files found).
**Severity:** MEDIUM
**Status:** Deferred — requires setting up test framework first (tracked in roadmap)

### 8. Share Dialog: Race Condition on Rapid Typing
**Location:** `frontend/src/components/ShareDialog.tsx`
**Issue:** Rapid typing can cause stale API responses to overwrite newer results. Debounce (200ms) mitigates but doesn't eliminate. An AbortController would fully resolve.
**Severity:** LOW
**Status:** Deferred — 200ms debounce is sufficient for the 2-10 user scale

---

## Deferred Review Findings (PR #132 — Collaborative Editor Crash Fix)

Identified during 4-agent code review of the collaborative editor provider crash fix. All CRITICAL, HIGH, MEDIUM, and LOW findings were addressed in the same PR.

### 9. Collaborative Editor: Editor Destroyed/Re-created on Sync Toggle (FIXED)
**Issue:** `useEditor` dependency array includes `[provider, isSynced]`. If `isSynced` toggles on reconnect, the editor is destroyed and re-created, losing cursor position and undo history.
**Fix:** Replaced `hasInitiallySynced` ref with `collaborationReady` latching state. Used `[provider, collaborationReady]` as `useEditor` deps — once latched to `true`, deps stay stable through transient desyncs, preventing editor recreation.
**Status:** Fixed

### 10. Collaborative Editor: Flash of Loading State on Fast Connections (FIXED)
**Issue:** On fast connections, users see a brief flash of the loading spinner before the editor appears.
**Fix:** Added 300ms CSS `animation-delay` via `fadeIn` keyframe so spinner only appears if loading persists.
**Status:** Fixed

### 11. Collaborative Editor: `noteId` Not Validated Before WS URL Interpolation (FIXED)
**Issue:** `noteId` was interpolated into the WebSocket URL without client-side format validation.
**Fix:** Added `UUID_RE` regex validation — invalid noteId renders error state instead of connecting.
**Status:** Fixed

### 12. Collaborative Editor: Token in localStorage (Systemic)
**Location:** All auth code across the app
**Issue:** JWT stored in localStorage is vulnerable to XSS. Systemic concern across the app, not specific to this component.
**Severity:** MEDIUM
**Status:** Deferred — systemic architecture concern; requires CSP/httpOnly cookie migration across all auth

### 13. Collaborative Editor: Hidden File Input Missing `aria-label` (FIXED)
**Issue:** The hidden file input for image upload lacked an `aria-label`.
**Fix:** Added `aria-label="Upload image to note"`.
**Status:** Fixed

### 14. Collaborative Editor: `console.error` in Production (FIXED)
**Issue:** Image upload failures logged to console in production.
**Fix:** Wrapped with `import.meta.env.DEV` conditional.
**Status:** Fixed

---

## Deferred Review Findings (PR #139 — Shared Editor Extensions + Crash Fix)

Identified during 4-agent code review (Architect, Dev, Security, UX). All CRITICAL and HIGH findings were fixed immediately.

### 15. Wiki Links Non-Functional in Collaborative Mode
**Location:** `frontend/src/components/CollaborativeTiptapEditor.tsx`
**Issue:** `onWikiLinkClick` is not passed to `getBaseExtensions` in the collaborative editor, so wiki link clicks silently do nothing. The non-collaborative editor wires it to a `ReferencesPanel`.
**Severity:** MEDIUM
**Status:** Deferred — collaborative mode has no `ReferencesPanel` in its render tree; requires adding the panel + `onNoteNavigate` prop

### 16. WebSocket Token Refresh on Reconnect
**Location:** `frontend/src/components/CollaborativeTiptapEditor.tsx`
**Issue:** `getToken` reads from `localStorage` but doesn't trigger a token refresh. If the access token expires while a WebSocket is open, reconnection attempts will fail with a stale token. The retry mechanism bumps `retryCount` but doesn't refresh the token first.
**Severity:** MEDIUM
**Status:** Deferred — requires wiring the axios refresh interceptor into the WebSocket auth flow

### 17. TipTap Package Version Alignment (FIXED)
**Location:** `frontend/package.json`
**Issue:** `@tiptap/extension-collaboration-cursor@3.0.0` depended on `y-prosemirror@1.3.7` (external), while `@tiptap/extension-collaboration@3.20.0` used `@tiptap/y-tiptap@3.0.2` (internal fork). Both defined `ySyncPluginKey('y-sync')` as different `PluginKey` instances, causing extension options to be lost during resolution.
**Fix:** Removed both `@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-cursor`. Replaced with a custom TipTap extension that imports `ySyncPlugin`, `yUndoPlugin`, and `yCursorPlugin` directly from `@tiptap/y-tiptap`. The Y.XmlFragment is passed as a closure variable, bypassing TipTap's extension options system entirely.
**Status:** Fixed in v1.2.2

---

## Deferred Review Findings (PR — Share UX Improvements v1.3.1)

Identified during 4-agent code review (Architect, Dev, Security, UX). HIGH and MEDIUM findings were fixed. The following LOW items are deferred:

### 18. Virtual Folder IDs Are Magic Strings
**Location:** `frontend/src/components/NoteList.tsx`, `FolderSidebar.tsx`
**Issue:** `'shared'`, `'my-shares'`, `'unfiled'`, `'trash'` are repeated as bare strings across multiple components with no shared constant.
**Severity:** LOW
**Status:** Deferred — extract a `VIRTUAL_FOLDERS` constant when more views are added

### 19. `any` Type Assertion in Tag Mapping
**Location:** `backend/src/services/share.service.ts`, `note.service.ts`
**Issue:** `(nt: any) => nt.tag` pattern used across all note-listing functions. Prisma's complex include types make this hard to avoid without manual type extraction.
**Severity:** LOW
**Status:** Deferred — systemic across all list endpoints

### 20. Sidebar Counts Not Refreshed After Share/Unshare Actions
**Location:** `frontend/src/components/FolderSidebar.tsx`
**Issue:** `sharedByMeCount` and `sharedWithMeCount` only refresh on navigation/mount, not after sharing or unsharing from ShareDialog. Count can be stale.
**Severity:** LOW
**Status:** Deferred — requires adding an `onShareChanged` callback from NoteEditor to FolderSidebar

### 21. Sidebar Navigation Missing ARIA Semantics (FIXED in v1.4.0)
**Location:** `frontend/src/components/FolderSidebar.tsx`
**Issue:** Sidebar buttons lack `aria-current`, `role="navigation"`, and `aria-label` for collapsed icon-only buttons.
**Fix:** Added `<nav role="navigation" aria-label="Sidebar navigation">` wrapper and `aria-current="page"` on active items in both collapsed and expanded views.
**Status:** Fixed

### 22. Duplicated "Shared by Me" Query Logic
**Location:** `backend/src/services/note.service.ts` (getNoteStats), `share.service.ts` (listSharedByMe)
**Issue:** The `{ userId, deleted: false, shares: { some: {} } }` where clause is duplicated. Could drift if the definition of "shared by me" changes.
**Severity:** LOW
**Status:** Deferred — extract a shared helper when the query evolves

---

## Deferred Review Findings (PR #150 — Stability Release v1.4.0)

Identified during 3-agent code review (Architect, Security, UX). All CRITICAL and HIGH findings were fixed immediately. The following MEDIUM/LOW items are deferred:

### 23. storeDocument Silent Data Loss on Upsert Failure
**Location:** `backend/src/services/collaboration.service.ts`
**Issue:** If the Prisma `upsert` in `storeDocument` fails, the error is logged and swallowed (by design — prevents WS server crash). However, this means collaborative edits could be silently lost without any user or admin notification.
**Severity:** MEDIUM
**Status:** Deferred — requires monitoring/alerting infrastructure (e.g., Sentry, PagerDuty) to surface DB write failures

### 24. GlobalErrorBoundary No Error Reporting Hookpoint
**Location:** `frontend/src/components/GlobalErrorBoundary.tsx`
**Issue:** `componentDidCatch` logs to console but has no mechanism to report errors to an external service (Sentry, LogRocket, etc.).
**Severity:** MEDIUM
**Status:** Deferred — add an optional `onError` prop or integrate with an error reporting service when one is adopted

### 25. GlobalErrorBoundary No Retry/Reset Mechanism
**Location:** `frontend/src/components/GlobalErrorBoundary.tsx`
**Issue:** Recovery paths are "Reload Page" (full page reload) and "Go Home" (navigate to /). No in-place retry that re-renders children without full page reload.
**Severity:** MEDIUM
**Status:** Deferred — add `resetErrorBoundary()` pattern when React error boundaries support it more naturally

### 26. `catch (error: any)` in AI Routes
**Location:** `backend/src/routes/ai.routes.ts`
**Issue:** All catch blocks use `error: any` instead of `error: unknown`. Using `unknown` forces explicit type narrowing and is the TypeScript best practice.
**Severity:** MEDIUM
**Status:** Deferred — code quality sweep across all route files

### 27. Toast Exit Animation Missing
**Location:** `frontend/src/components/Toast.tsx`
**Issue:** Toasts enter with a slide-in animation but disappear instantly. A fade-out or slide-out exit animation would feel more polished.
**Severity:** MEDIUM
**Status:** Deferred — requires `AnimatePresence`-style exit tracking or CSS `@starting-style` workaround

### 28. Toast Duration: Error Toasts Should Persist Longer
**Location:** `frontend/src/components/Toast.tsx`
**Issue:** All toast variants use 5s auto-dismiss. Error toasts may benefit from 8-10s or manual-dismiss-only since users need time to read error messages.
**Severity:** MEDIUM
**Status:** Deferred — minor UX polish

### 29. Toast `aria-live` Should Be `assertive` for Errors
**Location:** `frontend/src/components/Toast.tsx`
**Issue:** Toast container uses `aria-live="polite"` for all variants. WCAG recommends `aria-live="assertive"` for error/urgent messages so screen readers announce them immediately.
**Severity:** MEDIUM
**Status:** Deferred — requires per-toast `aria-live` region instead of container-level

### 30. AdminPanel Modals Lack ARIA Dialog Semantics
**Location:** `frontend/src/components/AdminPanel.tsx`
**Issue:** Admin modals (create user, edit user, reset password) don't use `role="dialog"`, `aria-modal="true"`, or focus trapping. Pre-existing issue, not introduced by v1.4.0.
**Severity:** MEDIUM
**Status:** Deferred — requires migrating admin modals to use the shared dialog/modal pattern

### 31. Collapsed Sidebar Icon Buttons Need `aria-label`
**Location:** `frontend/src/components/FolderSidebar.tsx`
**Issue:** In collapsed mode, folder/tag icon buttons have no `aria-label`. Screen readers can't identify what each icon represents.
**Severity:** MEDIUM
**Status:** Deferred — requires passing folder/tag name into the collapsed icon button's `aria-label`

### 32. EditableListItem Hover-Only Buttons Keyboard Inaccessible
**Location:** `frontend/src/components/EditableListItem.tsx`
**Issue:** Edit/delete action buttons are only visible on hover (`opacity-0 group-hover:opacity-100`). Keyboard-only users can tab to them but can't see them without hover.
**Severity:** MEDIUM
**Status:** Deferred — add `focus-within:opacity-100` to make buttons visible when focused via keyboard

### 33. ShareDialog Success Feedback Screen-Reader Only
**Location:** `frontend/src/components/ShareDialog.tsx`
**Issue:** After successfully sharing, the only feedback is a toast. Sighted users see it, but the dialog stays open with no visual indication that the share was added (the list updates, but subtly).
**Severity:** MEDIUM
**Status:** Deferred — minor UX polish

### 34. githubIssueUrl Protocol Validation at Write Time
**Location:** `frontend/src/data/changelog.ts`
**Issue:** The `githubIssueUrl` field (if present) is only validated when rendered as an anchor. Protocol validation (http/https only) should happen at data definition time to prevent XSS via `javascript:` URLs in changelog data.
**Severity:** MEDIUM
**Status:** Deferred — changelog data is developer-authored, not user input; low practical risk

### 35. Drag-and-Drop noteId UUID Validation
**Location:** `frontend/src/components/NoteList.tsx`
**Issue:** When dragging a note to a folder, the `noteId` from the drag event's `dataTransfer` is used without UUID format validation before the API call.
**Severity:** MEDIUM
**Status:** Deferred — drag data originates from the same component (same-origin), low practical risk

### 36. `@ts-ignore` Should Be `@ts-expect-error`
**Location:** Various frontend files
**Issue:** Some files use `// @ts-ignore` which silently suppresses errors. `// @ts-expect-error` is safer because it fails if the error is fixed, preventing stale suppressions.
**Severity:** LOW
**Status:** Deferred — code quality sweep

### 37. New Folder Button Needs `aria-label`
**Location:** `frontend/src/components/FolderSidebar.tsx`
**Issue:** The "+" button for creating a new folder has no `aria-label`, so screen readers announce it as just "button".
**Severity:** LOW
**Status:** Deferred — minor a11y polish

### 38. Module-Level Toast `idCounter` (HMR Concern)
**Location:** `frontend/src/components/Toast.tsx`
**Issue:** Toast IDs use a module-level counter that doesn't reset on HMR. IDs grow unboundedly during development. No production impact.
**Severity:** LOW
**Status:** Deferred — dev-only concern, no functional impact

### 39. ConfirmDialog Has No Focus Trap (FIXED in v1.4.0)
**Location:** `frontend/src/components/ConfirmDialog.tsx`
**Issue:** The dialog had `role="dialog"` and `aria-modal="true"` but no focus trap. Tab key could move focus to elements behind the backdrop.
**Fix:** Added `useEffect` focus trap that intercepts Tab/Shift+Tab and cycles focus within the dialog's focusable elements.
**Status:** Fixed

### 40. ConfirmDialog Does Not Restore Focus on Close (FIXED in v1.4.0)
**Location:** `frontend/src/components/ConfirmDialog.tsx`
**Issue:** When the dialog closed, focus dropped to the body instead of returning to the triggering element.
**Fix:** Save `document.activeElement` into `triggerRef` before opening; call `.focus()` via `requestAnimationFrame` on close.
**Status:** Fixed

### 41. AdminFeedbackPanel Row Toggle Missing `aria-expanded`
**Location:** `frontend/src/components/AdminFeedbackPanel.tsx`
**Issue:** Expand/collapse buttons for feedback rows have no `aria-expanded` attribute. Screen readers cannot determine row state.
**Severity:** LOW
**Status:** Deferred — add `aria-expanded={isExpanded}` and `aria-controls` to toggle buttons

---

## Deferred Review Findings (PR #154 — User-Reported Bugs v1.4.1)

Identified during 3-agent code review (Architect, Security, UX). All HIGH and MEDIUM findings were fixed immediately. The following items are deferred:

### 42. String-Matching on Error Messages for HTTP Status Dispatch
**Location:** `backend/src/routes/notes.routes.ts`
**Issue:** Route handler uses `error.message.includes('Only the owner')` and `error.message.includes('View-only')` for 403 dispatch. If the service error text changes, the route silently falls through to 500. Same fragility exists in the pre-existing `'not found'` → 404 pattern.
**Severity:** MEDIUM
**Status:** Deferred — extract typed error classes (e.g., `PermissionError`, `NotFoundError`) from the service layer

### 43. 403 Response Leaks Note Existence to VIEW-Permission Users
**Location:** `backend/src/routes/notes.routes.ts`
**Issue:** A VIEW-permission user attempting an update receives 403 (confirming the note exists) while an unshared user receives 404. This is an oracle for note existence, though constrained to authenticated users with existing share access.
**Severity:** MEDIUM
**Status:** Deferred — return 404 for VIEW-only update attempts to match unshared user behavior

---

## Deferred Review Findings (PR — MCP Integration v1.6.0)

Identified during 2-agent code review (Architect, Security). All CRITICAL and HIGH findings were fixed immediately. The following MEDIUM/LOW items are deferred:

### 44. MCP `by-title` Route Bypasses Service Layer (FIXED in v1.6.0)
**Location:** `backend/src/routes/mcp.routes.ts`
**Issue:** The `/mcp/notes/by-title` endpoint used a direct Prisma query instead of going through `note.service.ts`.
**Fix:** Extracted `getNoteByTitle()` to `note.service.ts`. MCP route now calls the service function.
**Status:** Fixed

### 45. MCP Routes Per-Handler try/catch Instead of Global Error Handler (FIXED in v1.6.0)
**Location:** `backend/src/routes/mcp.routes.ts`, `backend/src/routes/token.routes.ts`
**Issue:** Every route handler had its own try/catch block that mapped errors to HTTP responses redundantly.
**Fix:** Added plugin-level `setErrorHandler` to MCP routes. Removed all per-handler try/catch from both MCP and token routes. Token service now throws typed `AppError` subclasses.
**Status:** Fixed

### 46. No Per-Token Rate Limiting on MCP Routes (FIXED in v1.6.0)
**Location:** `backend/src/routes/mcp.routes.ts`
**Issue:** MCP routes relied on global rate limit only. No per-token limiting.
**Fix:** Added per-route `config.rateLimit` with 120 req/min per token (keyed by token hash).
**Status:** Fixed

### 47. MCP Recent Notes Endpoint Missing Offset Pagination (FIXED in v1.6.0)
**Location:** `backend/src/routes/mcp.routes.ts`
**Issue:** `/mcp/notes/recent` only accepted `limit`, not `offset`.
**Fix:** Added `offset` parameter to `recentNotesQuery` schema and pass to `listNotes`.
**Status:** Fixed

### 48. revokeApiToken TOCTOU Window (FIXED in v1.6.0)
**Location:** `backend/src/services/token.service.ts`
**Issue:** `revokeApiToken` used `findFirst` then `update` as two separate DB calls with a race window.
**Fix:** Replaced with atomic `updateMany` using `revokedAt: null` condition. Falls back to `findFirst` only for error discrimination.
**Status:** Fixed

### 49. token.routes.ts Uses Fragile String-Match Error Discrimination (FIXED in v1.6.0)
**Location:** `backend/src/routes/token.routes.ts`
**Issue:** Error handling used `error.message.includes(...)` for status dispatch.
**Fix:** Token service now throws typed errors (`NotFoundError`, `BadRequestError`, `AppError`). Token routes removed all try/catch — global error handler uses `statusCode` property.
**Status:** Fixed

### 50. Migration SQL Scopes Column Missing NOT NULL (FIXED in v1.6.0)
**Location:** `backend/prisma/migrations/20260228000000_add_api_tokens/migration.sql`
**Issue:** The `scopes` column was defined without `NOT NULL`.
**Fix:** Added `NOT NULL DEFAULT '{}'` to the column definition.
**Status:** Fixed

### 51. CodeBlockExtension Must Migrate to CodeBlockLowlight for Syntax Highlighting
**Location:** `frontend/src/components/CodeBlockExtension.tsx`
**Issue:** `CodeBlockExtension` currently extends `@tiptap/extension-code-block`. When syntax
highlighting is added (planned roadmap item), the extension must be refactored to extend
`@tiptap/extension-code-block-lowlight` instead. `CodeBlockLowlight` has a different
constructor signature, additional options (`lowlight`, `defaultLanguage`), and registers an
extra ProseMirror decoration plugin. The two base classes are **not** drop-in replacements —
a clean refactor is required rather than incremental modification.
**Action required when implementing syntax highlighting:**
1. **Frontend:** `npm install @tiptap/extension-code-block-lowlight lowlight`
2. **Frontend:** Change `import CodeBlock from '@tiptap/extension-code-block'` → `import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'`
3. **Frontend:** Replace `CodeBlock.extend(...)` with `CodeBlockLowlight.extend(...)` and pass a configured lowlight instance via options (e.g., `lowlight.registerLanguage(...)`)
4. **Backend:** `npm install @tiptap/extension-code-block-lowlight lowlight` in `backend/`
5. **Backend:** Swap the `CodeBlock` import in `tiptap-server.ts` for `CodeBlockLowlight` and pass a lowlight instance configured with the **same language set** as the frontend. Mismatched language sets will produce different HTML between client rendering and server `generateHTML()`, corrupting search snippets, AI note context, and markdown exports.
6. **Frontend:** In `CodeBlockExtension.tsx` line 2, replace `import CodeBlock from '@tiptap/extension-code-block'` with the lowlight import, and update the `CodeBlock.extend(...)` call to `CodeBlockLowlight.extend(...)`. **This file must be updated before removing the package in step 7**, or the build will fail.
7. **Both:** Remove `@tiptap/extension-code-block` from deps once both sides are migrated — keeping the old package installed alongside lowlight risks version drift.

**Note:** `CodeBlockLowlight` and `CodeBlock` are **not** drop-in replacements. The lowlight variant registers an extra ProseMirror decoration plugin and has different constructor options. Incremental/partial migration is not safe — migrate both sides together in one PR.

**Pre-migration refactor recommended:** Before the lowlight migration, split `CodeBlockExtension.tsx` into two files:
- `CodeBlockView.tsx` — the React node view component + constants (copy-button UI)
- `CodeBlockExtension.ts` — thin wiring file: `BaseClass.extend({ addNodeView() { ... } })`

This follows the existing `ImageUploadExtension.ts` / `ResizableImage.tsx` pattern. It means the lowlight migration only edits two lines in the wiring file rather than touching the entire copy-button UI.

**Known residual limitation:** `UNSAFE_UNICODE_RE` strips direction-control and invisible characters but does NOT strip homoglyph / confusable characters (e.g., Cyrillic `а` for Latin `a`, Mathematical Alphanumeric Symbols U+1D400–U+1D7FF). A note author who controls content could embed visually similar characters into a code block to make the copied command differ from what is displayed. Full homoglyph normalization would break legitimate multilingual code; this risk is accepted and documented here.

**Status:** Deferred — tracked for syntax highlighting milestone

---

## Deferred Review Findings (PR #18 -- Service Account Dashboard v1.18.0)

Identified during 4-agent code review (Architect, Dev, Security, UX). All IMMEDIATE findings were fixed before PR. The following MEDIUM/LOW items are deferred:

### 52. Duplicate formatDate/getRelativeTime Utilities
**Location:** `frontend/src/components/ServiceAccountDashboard.tsx`, `NoteList.tsx`, `KanbanBoard.tsx`
**Issue:** Nearly identical relative-time formatting functions duplicated across 3+ components.
**Severity:** LOW
**Status:** Deferred -- extract to shared `utils/formatDate.ts`

### 53. Dashboard Re-fetches on Back Navigation (No Cache)
**Location:** `frontend/src/components/ServiceAccountDashboard.tsx`
**Issue:** Navigating back from a service account's notes re-mounts the dashboard and re-fetches stats. Causes a flash. No stale-while-revalidate pattern.
**Severity:** LOW
**Status:** Deferred -- consider React Query / SWR if users report sluggishness

### 54. No Error Boundary Around ServiceAccountDashboard
**Location:** `frontend/src/pages/EditorPage.tsx`
**Issue:** If the dashboard component throws, it could blank the entire editor page. Other complex components (collaborative editor) have error boundaries.
**Severity:** MEDIUM
**Status:** Deferred -- add React error boundary wrapper

### 55. Amber Warning Dark Mode Contrast
**Location:** `frontend/src/components/ServiceAccountDashboard.tsx`
**Issue:** `dark:text-amber-400` on `dark:bg-gray-800` yields approximately 3.8:1 contrast ratio, below WCAG AA for small text. Should use `dark:text-amber-300`.
**Severity:** LOW
**Status:** Deferred -- minor a11y polish

### 56. N+1 Query Pattern in getServiceAccountStats
**Location:** `backend/src/services/user.service.ts`
**Issue:** 5 queries per service account inside Promise.all(accounts.map()). Acceptable for small counts (capped at 50), but should be consolidated to raw SQL aggregates if account count grows. Documented with TODO comment.
**Severity:** LOW
**Status:** Deferred -- optimize if service account count exceeds ~20

---

## Deferred Review Findings (v1.30.0 Pocket ID SSO, Slag + Flux 2026-10-08)

Fixed in the same change: admin accounts excluded from email auto-link, server-side group check
(`OIDC_REQUIRED_GROUP`), `__Host-` transaction cookie, relative SSO URL for dev, protocol-argument
tests, login-page flash, discovery timeout.

### 57. Removing Pocket ID access does not remove Notez access
**Location:** `backend/src/services/auth.service.ts` (password login, password reset)
**Issue:** An SSO-created user can set a real password through "forgot password" and keep using it after being removed from the Pocket ID group. Existing 7-day refresh sessions also survive. Offboarding currently means: remove from the group AND deactivate in Notez (documented in `docs/deployment.md`). Fix option: an SSO-only flag that refuses password login and reset for accounts created through SSO.
**Severity:** MEDIUM
**Status:** Deferred -- documented offboarding step; revisit when users beyond the household are added

### 58. Linked user with `mustChangePassword` is routed to change-password
**Location:** `frontend/src/App.tsx` (mustChangePassword gate), SSO callback
**Issue:** An existing user with `mustChangePassword=true` who signs in via SSO is sent to `/change-password`, which asks for the current (temporary) password. Not a dead end (an admin set it), but awkward. Option: clear the flag on SSO sign-in.
**Severity:** LOW
**Status:** Deferred -- decision for Adam

### 59. OIDC subject stored without issuer
**Location:** `backend/prisma/schema.prisma` (`users.oidc_subject`)
**Issue:** If `OIDC_ISSUER` is ever pointed at a different provider, its subjects would match existing links. Fix: store the issuer alongside the subject, or clear links when the issuer changes.
**Severity:** LOW
**Status:** Deferred -- single provider; note in any IdP migration runbook

### 60. Callback URL (code, state) appears in request logs
**Location:** Fastify default request logging, `/api/auth/oidc/callback`
**Issue:** The authorization code and state are logged with the URL. The code is single-use and useless without the PKCE verifier and client secret, so impact is low. Fix: redact the query for this route.
**Severity:** LOW
**Status:** Deferred

### 61. Two concurrent SSO logins in one browser
**Location:** `backend/src/routes/auth.routes.ts` (transaction cookie)
**Issue:** Starting SSO in two tabs overwrites the single transaction cookie, so the first tab's callback fails with a generic "failed" message. Harmless.
**Severity:** LOW
**Status:** Deferred

---

## Version Notes

| Issue | Identified | Fixed | Version |
|-------|------------|-------|---------|
| Focus visibility | 2025-11-29 | 2025-11-29 | v0.28.x |
| Mousewheel scroll | 2025-11-29 | 2025-11-29 | v0.28.x |
| BMad framework items | 2025-11-29 | Deferred | - |
| Share dialog a11y (focus trap, ARIA, labels) | 2026-02-22 | 2026-02-22 | v1.2.0 |
| Share contacts missing Zod validation | 2026-02-22 | 2026-02-22 | v1.2.0 |
| Share contacts unbounded query | 2026-02-22 | 2026-02-22 | v1.2.0 |
| Share dialog no-results/remove-confirm/responsive | 2026-02-22 | Deferred | - |
| Share contacts rate limit/tests/race condition | 2026-02-22 | Deferred | - |
| Collab editor provider crash (white screen) | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor sync guard/timeout/auth handling | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor reconnect stability (collaborationReady) | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor loading flash (fadeIn delay) | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor noteId validation | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor file input/button a11y | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor console.error in production | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor ARIA live regions/reduced-motion | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor upload error feedback | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Collab editor user-friendly error messages | 2026-02-22 | 2026-02-22 | v1.2.1 |
| Token in localStorage (systemic) | 2026-02-22 | Deferred | - |
| Collab editor duplicate link extension crash | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Collab editor shared extensions (single source of truth) | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Collab editor fragment passed directly (bypass getXmlFragment) | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Collab editor error boundary (prevent white screen) | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Collab editor undoRedo disabled for collab mode | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Link extension protocol allowlist + rel hardening | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Wiki links non-functional in collab mode | 2026-02-23 | Deferred | - |
| WebSocket token refresh on reconnect | 2026-02-23 | Deferred | - |
| TipTap y-prosemirror vs y-tiptap PluginKey conflict | 2026-02-23 | 2026-02-23 | v1.2.2 |
| Virtual folder ID magic strings | 2026-02-24 | Deferred | - |
| `any` type assertion in tag mapping | 2026-02-24 | Deferred | - |
| Sidebar counts stale after share/unshare | 2026-02-24 | Deferred | - |
| Sidebar missing ARIA semantics | 2026-02-24 | 2026-02-26 | v1.4.0 |
| Duplicated shared-by-me query logic | 2026-02-24 | Deferred | - |
| storeDocument silent data loss | 2026-02-26 | Deferred | - |
| GlobalErrorBoundary no error reporting hookpoint | 2026-02-26 | Deferred | - |
| GlobalErrorBoundary no retry/reset mechanism | 2026-02-26 | Deferred | - |
| `catch (error: any)` → `error: unknown` in routes | 2026-02-26 | Deferred | - |
| Toast exit animation missing | 2026-02-26 | Deferred | - |
| Toast error duration too short | 2026-02-26 | Deferred | - |
| Toast aria-live assertive for errors | 2026-02-26 | Deferred | - |
| AdminPanel modals lack ARIA dialog | 2026-02-26 | Deferred | - |
| Collapsed sidebar icons no aria-label | 2026-02-26 | Deferred | - |
| EditableListItem hover-only buttons | 2026-02-26 | Deferred | - |
| ShareDialog success feedback subtle | 2026-02-26 | Deferred | - |
| githubIssueUrl protocol validation | 2026-02-26 | Deferred | - |
| Drag-drop noteId UUID validation | 2026-02-26 | Deferred | - |
| @ts-ignore → @ts-expect-error | 2026-02-26 | Deferred | - |
| New folder button no aria-label | 2026-02-26 | Deferred | - |
| Toast idCounter HMR concern | 2026-02-26 | Deferred | - |
| ConfirmDialog no focus trap | 2026-02-26 | 2026-02-26 | v1.4.0 |
| ConfirmDialog no focus restore | 2026-02-26 | 2026-02-26 | v1.4.0 |
| AdminFeedbackPanel row toggle no aria-expanded | 2026-02-26 | Deferred | - |
| String-matching on error messages for status dispatch | 2026-02-26 | Deferred | - |
| 403 leaks note existence to VIEW-permission users | 2026-02-26 | Deferred | - |
| MCP `by-title` query bypasses service layer | 2026-02-27 | 2026-02-27 | v1.6.0 |
| MCP routes per-handler try/catch (global handler) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| No per-token rate limiting on MCP routes | 2026-02-27 | 2026-02-27 | v1.6.0 |
| MCP recent notes endpoint no offset pagination | 2026-02-27 | 2026-02-27 | v1.6.0 |
| revokeApiToken TOCTOU (two DB round-trips) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| token.routes.ts string-match error discrimination | 2026-02-27 | 2026-02-27 | v1.6.0 |
| Migration SQL scopes column missing NOT NULL | 2026-02-27 | 2026-02-27 | v1.6.0 |
| MCP auth error info leak (normalized) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| Token generation modulo bias (base64url) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| Unbounded MCP note append (500KB guard) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| MCP client no fetch timeout (15s added) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| No per-user token cap (20 limit added) | 2026-02-27 | 2026-02-27 | v1.6.0 |
| Token scope deduplication | 2026-02-27 | 2026-02-27 | v1.6.0 |
| htmlToPlainText missing entity decoding | 2026-02-27 | 2026-02-27 | v1.6.0 |
| CodeBlockExtension → CodeBlockLowlight refactor needed for syntax highlighting | 2026-03-07 | Deferred | - |
| Duplicate formatDate/getRelativeTime utilities | 2026-04-05 | Deferred | - |
| Dashboard re-fetches on back navigation | 2026-04-05 | Deferred | - |
| No error boundary around ServiceAccountDashboard | 2026-04-05 | Deferred | - |
| Amber warning dark mode contrast | 2026-04-05 | Deferred | - |
| N+1 query in getServiceAccountStats | 2026-04-05 | Deferred | - |
| SSO: admin account takeover via email auto-link | 2026-10-08 | 2026-10-08 | v1.30.0 |
| SSO: group enforced only by provider | 2026-10-08 | 2026-10-08 | v1.30.0 |
| SSO: transaction cookie tossing from sibling subdomain | 2026-10-08 | 2026-10-08 | v1.30.0 |
| SSO: Pocket ID removal does not remove Notez access (#57) | 2026-10-08 | Deferred | - |
| SSO: mustChangePassword after SSO sign-in (#58) | 2026-10-08 | Deferred | - |
| SSO: subject stored without issuer (#59) | 2026-10-08 | Deferred | - |
| SSO: callback code in request logs (#60) | 2026-10-08 | Deferred | - |
| SSO: concurrent logins share one transaction cookie (#61) | 2026-10-08 | Deferred | - |

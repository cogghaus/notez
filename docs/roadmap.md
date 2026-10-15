# Notez Development Roadmap

This document outlines planned features for Notez beyond the current MVP implementation.

Last Updated: 2026-02-27

---

## Current Status: v1.8.0

Public-readiness release: PII scrub, security defaults hardened, governance files (LICENSE, SECURITY.md, CONTRIBUTING.md), documentation rewrite.

---

## Phase 1: Stability & Security ✅ MOSTLY COMPLETE

> **Goal:** Prepare for public release with security hardening and testing foundation

### 1.1 Security Hardening ✅ COMPLETE

- [x] Rate limiting via `@fastify/rate-limit`
  - Login endpoint: 5 attempts per 15 minutes
  - API endpoints: 100 requests per minute
  - Password reset: 3 attempts per 15 minutes
- [x] SQL injection prevention (parameterized queries)
- [x] Image content validation (Sharp-based)
- [x] Security headers (`X-Content-Type-Options: nosniff`)
- [x] Session invalidation on logout
- [x] Brute force protection (IP + username keying)
- [x] Production environment validation

### 1.2 Remaining 1.0 Tasks

**Status:** In Progress
**Tracking:** See issues labeled `1.0-hardening`

- [x] Error boundary coverage (#69) — Fixed in v1.4.0
- [ ] Load testing with concurrent users (#67)
- [ ] Memory leak detection (#68)
- [ ] Edge case input testing (#70)
- [ ] Authentication edge cases (#64)
- [ ] Avatar loading after logout/login (#74)

---

## Next Up: User-Reported Bugs (v1.4.1) ✅ COMPLETE

> **Goal:** Fix bugs reported by real users via in-app feedback
> **Source:** In-app feedback submissions from user "pam"

### Shared Note Metadata Not Saving + Stale Folder List ✅

**Fixed in v1.4.1** — Auto-save now allows metadata (folder, title, tags) saves via REST even in collaborative mode. Backend returns 403 for permission errors. FolderChip already refreshes on open (was already implemented).

### Kanban Board Ignores Completed Tasks Filter ✅

**Fixed in v1.4.1** — Added "Show completed" toggle to KanbanBoard header. Hides COMPLETED and CANCELLED columns when unchecked (default: unchecked). Keyboard navigation respects visible columns.

### Modal Text Selection Closes Dialog ✅

**Fixed in v1.4.1** — Switched backdrop from `onClick` to `onMouseDown` in ShareDialog, ConfirmDialog, and WhatsNewModal (already fixed in FeedbackModal since v1.3.3).

---

## Phase 2: Enhanced Note Capabilities

> **Goal:** Add features that enhance daily note-taking workflow

### 2.1 MCP Server Integration ✅ COMPLETE (v1.6.0)

- [x] API token system (`ntez_` prefix, SHA-256 hashed, scoped read/write)
- [x] Token management routes (POST/GET/DELETE /api/tokens)
- [x] MCP API routes (/api/mcp/* — notes, tasks, folders)
- [x] Standalone MCP server package (`notez-mcp/`) with 11 tools
- [x] Notes: search, get, get-by-title, create, append, list-recent
- [x] Tasks: list, get, create, update-status
- [x] Folders: list
- [x] Token management UI in frontend Settings page (v1.7.0)
- [x] npm-publishable notez-mcp — `npx notez-mcp` (v1.7.0)
- [ ] Semantic search tool (requires pgvector — see Phase 3.2)

### 2.2 Note Linking (Wiki-Style)

**Status:** Planned
**Priority:** High
**Issue:** #88

Enable `[[Note Title]]` syntax to link between notes:
- TipTap extension for `[[]]` syntax
- Autocomplete for note titles
- Backlinks panel showing incoming links
- Broken link indicators

### 2.3 Version History

**Status:** Planned
**Priority:** Medium
**Issue:** #89

Track note changes and enable restore:
- Capture snapshots on significant saves
- Keep last 10 versions per note
- Simple diff view
- One-click restore

### 2.4 Code Block Enhancements

**Status:** Partially Complete
**Priority:** Medium

- [x] Click-to-copy button on code blocks (v1.16.0)
- [ ] Syntax highlighting with language detection (lowlight / highlight.js integration)
- [ ] Language label displayed in code block header

### 2.5 Image Improvements

**Status:** Partially Complete
**Priority:** Medium

- [x] Image paste/upload support (v0.31.0)
- [x] Inline image resizing (v0.31.1)
- [ ] Image gallery view
- [ ] Bulk image management

---

## Phase 3: Organization & Scale

> **Goal:** Support larger note collections and advanced workflows

### 3.1 Multi-Workspace Support

**Status:** Planned
**Priority:** Medium

Separate workspaces for different contexts:
- Workspace switcher in navigation
- Isolated folders, notes, tasks per workspace
- Quick-switch keyboard shortcut

### 3.2 Advanced Search (Semantic)

**Status:** Planned
**Priority:** Medium

AI-powered semantic search:
- Generate embeddings for note content
- Store in pgvector
- Hybrid search: full-text + semantic
- "Find similar notes" feature

### 3.3 Import/Export

**Status:** Planned
**Priority:** Medium

Bulk data management:
- Export all notes as markdown (zip)
- Export to JSON for backup
- Import from markdown files
- Import from Obsidian/Notion format

### 3.4 API Documentation

**Status:** Planned
**Priority:** Low

- OpenAPI/Swagger specification
- Interactive documentation UI
- API versioning support

---

## Phase 4: Collaboration & Mobile

> **Goal:** Enable team usage and mobile access

### 4.1 Note Sharing ✅ COMPLETE (v1.2.0)

- [x] Share notes with other users by username or email
- [x] Permission levels: View and Edit
- [x] Shared-with-me notes list
- [x] In-app notifications when notes are shared
- [x] Contacts autocomplete for previously shared users

### 4.2 Real-Time Collaboration ✅ COMPLETE (v1.2.0)

- [x] CRDT-based collaborative editing (Yjs + Hocuspocus)
- [x] Cursor presence indicators with user colors
- [x] Automatic conflict resolution
- [x] Markdown-to-Yjs round-trip sync

### 4.3 Share Invitations

**Status:** Backlog
**Priority:** Medium

Accept/decline workflow for share invitations:
- Share creates a pending invitation instead of immediate access
- Recipient receives notification with accept/decline actions
- Owner can see pending vs. accepted shares
- Optional: configurable per-instance (auto-accept for trusted self-hosted, require acceptance for public instances)

### 4.4 Mobile Apps

**Status:** Future

Native iOS/Android applications:
- React Native implementation
- Offline support with sync
- Quick capture widget

### 4.5 Mobile Web Rework (v1.31)

**Status:** Spec approved 2026-10-11; building. Done: PR1 editor keyboard scroll (v1.30.5), CI e2e (v1.30.6), PR2 pane widths, Settings on phones, plain previews, dark inputs (v1.31.2; 1.31.1 was the sign-in hotfix). Building: PR3 mobile shell and navigation (v1.33.0, approved; 1.32.0 was the TRUST_PROXY follow-up).

Phone and foldable layouts for the web app: editor keyboard scroll fix, 3-tab navigation, editor
writing mode, tasks agenda with quick add, task soft delete, two-pane layout on the Pixel Fold inner
screen, installable web app (manifest only). Source of record: `docs/mobile/` (audit and decisions,
design spec, phased build plan); prototype in `mockups/mobile/prototype.html`.

---

## Up Next: Service Account Visibility (v1.18.0-v1.20.0)

> **Goal:** Give admins proper oversight into service account activity

### Service Account Dashboard (v1.18.0) -- PR #18
- [x] Card-based dashboard with per-account stats
- [x] Health indicators (token expiry, dormancy, no active tokens)
- [x] Server-side filtering by specific service account
- [ ] Account workspace drill-down with folder tree (v1.19.0)
- [ ] Activity timeline showing agent actions (v1.20.0)

### Agent Accounts (v1.21.0-v1.23.0) -- Planned

> **Goal:** Per-user AI agent support with content attribution

- [ ] Agent tokens: API tokens with `isAgent` flag + display config (name, icon, color) (v1.21.0)
- [ ] Content attribution: `createdByTokenId` FK on notes/folders/tags/tasks (v1.21.0)
- [ ] User settings: "My Agents" section for agent token management (v1.22.0)
- [ ] Sidebar: "Agents" section with namespace filtering + mixed-view toggle (v1.23.0)
- [ ] Agent content badges/visual indicators on notes and folders (v1.23.0)
- [ ] Data migration: move existing claude-agent content to personal agent account (v1.23.0)

---

## Backlog (Unscheduled)

These features are tracked but not yet prioritized:

- **Task search** - Search/filter tasks by title or description (requested by pam). Planned in the mobile rework, PR6 (`docs/mobile/03-build-plan.md`)
- **Expanded task list view** - Show more task detail inline without opening each task (requested by pam). Addressed on mobile by the tasks agenda rows, PR6
- **Share accept/decline flow** - Require recipients to accept share invitations before granting access (see Phase 4.3)
- **Rich text toolbar** - Visual formatting buttons
- **Note templates** - Predefined structures
- **Browser extension** - Quick capture from web
- **Note encryption** - End-to-end encryption
- **Nested folders** - Multi-level folder hierarchy
- **Daily notes** - Auto-generated daily note template
- **Graph visualization** - Visual note connections
- ~~**Webhooks** - Integration with external services~~ ✅ shipped in v1.17.0

---

## Recently Completed

### v1.17.0 (2026-03-08)
- Full webhook system — register HTTPS endpoints to receive signed push notifications for task/note/folder changes
- HMAC-SHA256 signing with timestamp in signed payload (replay attack prevention)
- 7-attempt exponential backoff delivery worker, auto-disable after 50 failures
- Delivery log, replay, and bulk catch-up endpoints
- Webhook settings UI in Settings → Webhooks
- SSRF protection (blocks all private IP ranges including IPv4-mapped IPv6)

### v1.16.0 (2026-03-07)
- Code block copy button

### v1.15.0 (2026-03-06)
- Versioned external API at `/api/v1/`

### v1.8.0 (2026-02-27)
- Public-readiness: PII scrub, sanitized compose files and docs
- Security defaults hardened — all secrets now required (no fallbacks)
- Governance files: LICENSE (MIT), SECURITY.md, CONTRIBUTING.md
- README rewrite reflecting current project state

### v1.7.0 (2026-02-27)
- Token Management UI — create, view, copy, revoke API tokens from Settings
- npm-publishable notez-mcp — bin/files/engines/prepublishOnly for `npx notez-mcp`
- notez-mcp README with setup guide, tools table, Claude Code config example

### v1.6.0 (2026-02-27)
- MCP Server integration — API token auth + standalone MCP server package
- 11 MCP tools (notes: search, get, get-by-title, create, append, list-recent; tasks: list, get, create, update-status; folders: list)
- Token management routes (POST/GET/DELETE /api/tokens)
- Security: base64url token encoding, 500KB append guard, 15s fetch timeout, 20-token cap, scope deduplication

### v1.5.0 (2026-02-27)
- Service accounts — admin read-only browsing of agent content

### v1.4.1 (2026-02-26)
- Fixed shared note metadata (folder/title/tags) silently dropping
- Kanban board "Show completed" toggle
- Modal text selection no longer closes dialogs (3 modals fixed)
- Backend 403 for note permission errors (was 500)

### v1.4.0 (2026-02-26)
- Global error boundary (prevents white-screen crashes)
- Toast notification system (replaces silent console.error failures)
- Backend safe fire-and-forget for notification dispatches
- Collaboration service + WebSocket error handling hardening
- Standardized backend error response format
- Production console cleanup
- Sidebar ARIA semantics

### v1.2.0 (2026-02-22)
- Note sharing (user-to-user with VIEW/EDIT permissions)
- Real-time collaborative editing (Yjs/Hocuspocus CRDT)
- Contacts autocomplete in share dialog
- Automated deployment via self-hosted GitHub Actions runner

### v1.0.0-rc.2 (2025-12-03)
- Security hardening (rate limiting, SQL injection, image validation)
- Collapsed sidebar improvements

### v1.0.0-rc.1 (2025-12-02)
- MVP feature complete
- Self-service password reset
- Unified Settings Hub
- User avatars

### v0.31.x (2025-12)
- Image support with MinIO storage
- Inline image resizing

### v0.30.x (2025-11)
- Folder icons
- What's New modal

### v0.29.x (2025-11)
- Task management system
- Note organization improvements

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| v1.8.0 | 2026-02-27 | Public-readiness release |
| v1.7.0 | 2026-02-27 | Token Management UI + npm-publishable MCP server |
| v1.6.0 | 2026-02-27 | MCP Server integration |
| v1.5.0 | 2026-02-27 | Service accounts |
| v1.4.1 | 2026-02-26 | User-reported bug fixes |
| v1.4.0 | 2026-02-26 | Stability release |
| v1.0.0-rc.2 | 2025-12-03 | Security hardening release |
| v1.0.0-rc.1 | 2025-12-02 | MVP feature complete, user avatars, dynamic AI models |
| v0.31.x | 2025-12 | Image support |
| v0.30.x | 2025-11 | Folder icons, What's New |
| v0.29.x | 2025-11 | Task management |
| v0.28.x | 2025-11 | Initial MVP |

---

## Contributing

Feature requests and bug reports are welcome! Please check the existing roadmap before suggesting new features.

Priority is given to:

1. Security and stability improvements
2. Features that improve daily workflow
3. Features requested by multiple users
4. Features aligned with self-hosted philosophy

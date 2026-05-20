# Changelog

All notable changes to Notez will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.29.0] - 2026-05-20

### Added

- **Filter tasks by folder** — selecting a folder in the sidebar while in Tasks view now filters the task list to tasks belonging to that folder. Switching between notes and tasks views preserves the folder context. Virtual folders (Unfiled, Trash, Shared, etc.) continue to switch to the notes view as before. Frontend only — no backend changes (the `folderId` query param on `GET /api/tasks` was already supported).

### Added

- **OpenTelemetry instrumentation** — backend now ships traces, metrics, and logs to the homelab OTel Collector (OpenObserve backend) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Uses `@opentelemetry/auto-instrumentations-node` for zero-code instrumentation of Fastify, HTTP, Postgres/Prisma, and outbound fetch. Set `OTEL_SDK_DISABLED=true` to opt out.

## [1.27.0] - 2026-04-14

### Added

- **MCP: Task Links** — New tools `notez_add_task_link`, `notez_update_task_link`, `notez_delete_task_link` for managing URL links on tasks via MCP. Each task supports up to 10 links.
- **MCP: Notifications** — New tools `notez_list_notifications`, `notez_get_unread_count`, `notez_mark_notification_read`, `notez_mark_all_notifications_read`, `notez_delete_notification`. Read tools use `mcp:read` scope; mutation tools use `mcp:write`.
- **MCP: Feedback** — New tools `notez_create_feedback`, `notez_list_my_feedback`, `notez_get_feedback` for submitting and reviewing bug reports and feature requests via MCP.
- **MCP: AI** — New tools `notez_check_ai_status`, `notez_ai_summarize`, `notez_ai_suggest_title`, `notez_ai_suggest_tags`. AI tools use the user's configured provider; `notez_ai_suggest_tags` fetches the user's existing tags for context (mirrors the REST route behaviour). Status check uses `mcp:read`; inference tools use `mcp:write`.

### Fixed

- **MCP: Task dueDate** — `notez_update_task` description now explicitly states that `dueDate` must be an ISO 8601 string (e.g. `2026-04-20T00:00:00Z`) and that `priority` must be one of `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Previously, ambiguous descriptions caused Claude to pass natural-language values that failed Zod validation silently.
- **MCP: Task completedAt** — `notez_get_task` and `notez_list_tasks` descriptions now document the `completedAt` field (set automatically when status changes to `COMPLETED`, cleared otherwise).

## [1.26.0] - 2026-04-13

### Changed

- **MCP Connector Auto-Approval**: New MCP client registrations are now auto-approved when the redirect URI matches the trusted domain allowlist (claude.ai, anthropic.com). Previously, an admin had to manually approve each registration. This was incompatible with claude.ai's connector flow which performs DCR + authorize as a single atomic operation, leaving no time for admin approval. Security model is unchanged: the strict redirect URI allowlist is the trust boundary, and per-user consent is still required.
- **Pending Client Cap**: Replaced "20 pending clients" cap with "100 total clients" cap. Cleanup now removes rejected and stale clients.
- **Notification Wording**: Updated to reflect auto-approval ("registered as a connector" vs "is requesting access").

## [1.25.0] - 2026-04-13

### Fixed

- **MCP OAuth Consent Flow**: Fixed "code: Field required" error when connecting via claude.ai. The consent page's `fetch()` could not follow cross-origin 302 redirects to claude.ai's callback (CORS blocks fetch from navigating cross-origin). Changed `/mcp/oauth/approve` to return `{ redirect_url: "..." }` as JSON; frontend navigates via `window.location.href`.

## [1.24.0] - 2026-04-13

### Added

- **MCP Connectors Admin UI**: New "MCP Connectors" section in Settings (admin-only) for managing external app registrations.
  - Approve, reject, and revoke connector access from the UI
  - Filter connectors by status (all/pending/approved/rejected)
  - Auto-refresh every 15s for new registrations
  - Pending approval count banner
  - Status badges, scope display, registration timestamp
- **DCR Notification**: Admin notification on new MCP client registration with click-through to Connectors settings (orange plug icon, `MCP_CLIENT_PENDING` type)

## [1.23.0] - 2026-04-12

### Added

- **Remote MCP Connector**: Notez can now be connected to claude.ai as a custom connector, enabling access from Claude on web, desktop, and mobile devices.
  - OAuth 2.1 authorization server with PKCE, Dynamic Client Registration, and refresh token rotation
  - MCP Streamable HTTP transport at `/mcp` (POST/GET/DELETE) per MCP spec 2025-03-26
  - Consent UX page at `/oauth/consent` showing requesting app, permissions, and account info
  - Feature-gated via `MCP_REMOTE_ENABLED` environment variable (default: off)
  - Admin-approve DCR: new client registrations require admin approval before use
  - Read-only scoped tools in v1.23 (`mcp:read`); write scope (`mcp:write`) planned for v1.24
  - Per-user session caps (5), global session cap (100), idle session reaper (10 min)
  - Shared tool registration module: both stdio `notez-mcp` and remote connector use the same tool definitions
  - Delimiter-wrapped tool responses to mitigate prompt injection via note content
  - OAuth tables: `oauth_clients`, `oauth_authorization_codes`, `oauth_access_tokens`, `oauth_user_consents`

### Security

- Strict redirect URI allowlist (code-level, not configurable) for OAuth clients
- PKCE (S256) mandatory on all authorization flows
- Refresh token rotation with replay detection (revokes entire token family on reuse)
- Authorization codes: single-use, 10-minute TTL, stored hashed
- Client secrets: bcrypt hashed
- Session-to-token binding prevents session fixation across users
- Origin header allowlist on MCP transport (configurable via `MCP_ALLOWED_ORIGINS`)
- Rate limits on DCR (5/15min), authorize (30/min), token (20/min), transport (60/min)

## [1.22.0] - 2026-04-06

### Added

- **My Agents settings UI** (EPIC-005): New "My Agents" section in Settings where users can create, edit, and revoke agent tokens with custom display config.
  - Agent creation form with icon picker (16 curated icons), color picker (12 preset colors), name, scopes, and expiration
  - Agent card list showing icon, name, token prefix, scopes, dates, and usage stats
  - Inline editing of agent display config (name, icon, color)
  - Token reveal flow with QR code, copy-to-clipboard, and 5-minute auto-clear
  - Active/revoked sections matching existing API Tokens pattern
  - Full dark mode support

## [1.21.0] - 2026-04-05

### Added

- **Agent accounts foundation** (EPIC-004): API tokens can now be designated as "agents" with display config (name, icon, color). Content created via agent tokens is automatically attributed.
  - `ApiToken` model extended with `isAgent`, `agentName`, `agentIcon`, `agentColor` fields
  - `createdByTokenId` nullable FK added to notes, folders, tags, and tasks for content attribution
  - Auth middleware now passes `apiTokenId` through on API token requests
  - MCP routes auto-stamp `createdByTokenId` on content creation and tag upserts (create + update paths)
  - `POST /tokens/agents` - create an agent token with display config
  - `GET /tokens/agents` - list agent tokens for the current user
  - `PATCH /tokens/agents/:id` - update agent token display config (atomic, no TOCTOU)
  - `agentCreated` boolean query filter on `GET /mcp/notes` and `GET /mcp/tasks` for easy filtering
  - `createdByTokenId` UUID query filter for precise per-token filtering
  - Agent name restricted to safe characters (alphanumeric, spaces, hyphens, underscores, periods)
  - 16 curated Lucide agent icons, hex color validation
  - Reversible migration (additive-only, no data changes)

### Changed

- Token creation logic refactored: shared `prepareTokenCreation()` and `resolveExpiry()` helpers eliminate duplication
- `resolveExpiry()` now throws on unknown expiry values instead of silently defaulting to no expiry
- `listApiTokens` response now includes agent fields (`isAgent`, `agentName`, `agentIcon`, `agentColor`)
- Removed redundant `@@index([tokenHash])` (already covered by `@unique` constraint)

## [1.20.0] - 2026-04-05

### Added

- **Service account activity timeline** (EPIC-003): Reverse-chronological stream showing what each service account has been doing. Merges notes, tasks, and folders into a single sorted timeline with cursor-based pagination.
  - `GET /admin/service-accounts/:id/activity?limit=50&before=<cursor>` - merged activity endpoint
  - Action derived from timestamps: "Created" when `createdAt ~= updatedAt`, "Updated" otherwise
  - Activity grouping: consecutive same-type/action/folder items within 5 minutes collapse into expandable groups (e.g., "Created 12 notes in Research")
  - Filter dropdowns: by action type (created/updated) and content type (notes/tasks/folders)
  - Click-through: note items open in read-only viewer
  - Date section headers (Today, Yesterday, formatted dates)
  - Cursor uses `lte` with client-side deduplication to avoid skipping items with identical timestamps

## [1.19.0] - 2026-04-05

### Added

- **Service account workspace drill-down** (EPIC-002): Full browsable workspace when clicking into a service account from the dashboard.
  - `GET /admin/service-accounts/:id/folders` - folder tree with note counts per folder + unfiled count
  - `GET /admin/service-accounts/:id/notes?folderId=X&limit=50&offset=0` - paginated notes with tags (no longer stripped)
  - `GET /admin/service-accounts/:id/tags` - tags with split noteCount/taskCount + combined usageCount
  - Folder tree sidebar with tag list, "All Notes" and "Unfiled" sections
  - Search within account, paginated note list with Load More
  - Content/Activity tab bar (Activity tab implemented in v1.20.0)
  - All per-account endpoints validate service account ownership (404 for non-SA, 400 for regular user)
  - `folderId` query param validated as UUID or literal `'unfiled'`
  - ARIA listbox/option roles with `aria-selected` on folder and tag sidebar items

## [1.18.0] - 2026-04-05

### Added

- **Service account dashboard** (EPIC-001): Card-based overview replacing the flat note dump when clicking "Service Accounts" in the admin sidebar.
  - `GET /admin/service-accounts/stats` - per-account aggregate stats (note/folder/tag/task counts, lastActivity, recent notes, token health)
  - Dashboard cards with health warning badges: token expiring (amber), token expired (red), dormant account >30d (amber), no active tokens (red)
  - Click card to drill into account workspace (EPIC-002)
  - Server-side `userId` filter on `GET /admin/service-accounts/notes` endpoint (fixes client-side filtering bug)
  - Typed `ServiceAccountStat` interface shared between API and frontend
  - Full accessibility: `focus-visible` ring, `aria-label` on cards and buttons, `role="status"` on loading, `role="alert"` on error

## [1.17.0] - 2026-03-08

### Added

- **Webhook system**: Full-featured outbound webhook delivery for Notez. Register HTTPS endpoints to receive signed HTTP POST notifications when tasks, notes, or folders change. Designed for PAM Android companion app but generic for any consumer.
  - `POST /api/webhooks` — register a webhook (URL, event filter, HMAC secret, metadata)
  - `GET /api/webhooks` — list subscriptions
  - `PATCH /api/webhooks/:id` — update URL, events, status (active/paused/disabled), or rotate secret
  - `DELETE /api/webhooks/:id` — remove subscription and cancel pending deliveries
  - `POST /api/webhooks/:id/test` — fire a synthetic test event to verify the endpoint
  - `GET /api/webhooks/:id/deliveries` — queryable delivery log (filter by status, event type, date)
  - `POST /api/webhooks/:id/deliveries/:deliveryId/replay` — re-fire a specific delivery
  - `POST /api/webhooks/:id/replay` — bulk replay events for a time range (catch-up after downtime)
- **Event types**: `task.created`, `task.updated`, `task.completed`, `task.uncompleted`, `task.deleted`, `note.created`, `note.updated`, `note.deleted`, `folder.created`, `folder.updated`, `folder.deleted`. Wildcard `*` subscribes to all.
- **Payload format**: Every delivery includes full current entity state (`data`) plus changed fields with previous values (`previous_data`) — consumers never need a follow-up GET.
- **HMAC-SHA256 signing**: Every delivery is signed with `X-Notez-Signature: sha256={hex}` over the raw body. `X-Notez-Timestamp` (Unix epoch) included for replay attack prevention (consumers should reject if `|now - ts| > 300s`).
- **Secret rotation**: `PATCH /api/webhooks/:id { "secret": "new" }` rotates the secret with a 1-hour grace period where both old and new secrets are valid — zero-downtime rotation.
- **Background delivery worker**: Webhook HTTP calls are fully async and non-blocking. A 5-second poll loop processes deliveries with 7-attempt exponential backoff (immediate → 30s → 2m → 10m → 1h → 4h → 12h).
- **Auto-disable**: Webhooks are automatically set to `disabled` after 50 consecutive delivery failures. Re-enable via `PATCH /api/webhooks/:id { "status": "active" }`.
- **SSRF protection**: Webhook URLs are validated against private IP ranges (loopback, RFC1918, link-local) before registration.
- **Rate limiting**: Max 10 webhooks per user.
- **Data retention**: Delivery log pruned after 30 days, event log after 90 days. Configurable via `WEBHOOK_DELIVERY_RETENTION_DAYS` and `WEBHOOK_EVENT_RETENTION_DAYS` env vars.
- **Webhook settings UI**: New "Webhooks" section in Settings with registration form, event picker, secret generator/copier, per-webhook delivery log, test button, pause/resume, and a HMAC verification code example.

## [1.16.0] - 2026-03-07

### Added

- **Code block copy button**: Each fenced code block in the editor now displays a "Copy" button in the top-right corner on hover. Button shows "Copied!" on success or "Failed" if the clipboard API is unavailable. Accessible via keyboard (`:focus-visible`) with screen reader announcements via `aria-live`.

## [1.15.0] - 2026-03-06

### Added

- **Versioned external API**: All API token-authenticated routes are now available at `/api/v1/` in addition to the existing `/api/mcp/` path. `/api/mcp/` is kept as a legacy alias for backwards compatibility while existing clients migrate.

### Changed

- **API reference documentation**: Rewrote `docs/api-reference.md` to cover the full API surface (previously missing ~half the endpoints). Moved from `docs/brownfield/` to `docs/` root along with `data-model.md` and `development-patterns.md`. Removed stale BMAD process artifacts.

## [1.14.0] - 2026-03-04

### Added

- **QR code on token generation**: When creating an API token, a scannable QR code is displayed alongside the copy button, enabling mobile apps (e.g., PAM) to capture the token by scanning instead of manual paste.
- **Token auto-dismiss**: Token reveal banner auto-clears after 5 minutes with a 30-second warning. Clipboard is cleared on expiry if the token was copied.
- **QR accessibility**: Proper SVG title, screen-reader-friendly token display with `aria-hidden` code block and sr-only label, scoped `role="alert"` on heading only.
- **Responsive QR layout**: Side-by-side on desktop (QR left, token right), stacked on mobile (copy action first, QR below).

## [1.13.0] - 2026-03-01

### Added

- **Change username from Profile Settings**: Users can now edit their username inline from the profile header. Validates uniqueness (case-insensitive) and character rules. Backend: `PATCH /api/profile/username` with `changeUsernameSchema`.

### Fixed

- **Arrow-key navigation on segmented control**: Account type radio group in Create User modal now supports Left/Right arrow key navigation per WAI-ARIA radio pattern, with roving tabindex.
- **"No email" copy mismatch**: Standardized "No email set" → "No email" across AdminPanel and ProfileSettings.
- **Missing `htmlFor`/`id` on form labels**: Added matching `htmlFor`/`id` pairs to Username, Email, Password, Role, Token Name, and Reset Password fields across all admin modals.
- **Frontend `usersApi.update` type mismatch**: Tightened type to `{ isActive?, mustChangePassword?, role? }` to match backend `updateUserSchema` (removed stale `username`/`email` fields).
- **Reset Password & Token Management modals — dialog ARIA + focus trap + Escape**: Applied `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, and Escape key handler to both modals (matching the existing Create User modal pattern).
- **Service account ProfileSettings**: Email and Password sections are now hidden when the logged-in user is a service account.
- **Accessible labels on icon-only buttons**: Added `aria-label` to all icon-only buttons in ProfileSettings and AdminPanel (username edit, save, cancel, close, avatar).
- **Status messages announced to screen readers**: Error and success messages in ProfileSettings now use `role="alert"` and `role="status"`.

### Security

- **Username change rate limiting**: PATCH /api/profile/username limited to 5 changes per hour per user.
- **Service accounts blocked from username change**: Returns 403 Forbidden.
- **Race condition handled**: Prisma P2002 unique constraint violation caught as a fallback for the case-insensitive duplicate check.
- **Reserved username denylist**: Prevents users from claiming names like `admin`, `system`, `root`, `api`, etc. Applied to create user and change username schemas (not initial setup).
- **Case-insensitive unique index**: New migration adds `LOWER(username)` unique index to prevent "Admin" and "admin" from coexisting.

### Changed

- **Modal backdrop click-to-close**: Clicking outside a modal now dismisses it (Create User, Reset Password, Token Management).
- **Auto-focus on modal open**: Create User focuses username input, Reset Password focuses password input, Token Management focuses close button.

## [1.12.0] - 2026-03-01

### Added

- **Redesigned account creation modal**: Segmented control at the top lets admins toggle between "User" and "Service Account" modes. Each mode shows only the relevant fields — no more impossible states (e.g., Admin + Service Account).
- **Email now optional for service accounts**: Database schema updated to allow NULL email. Existing service account emails cleared via migration. Regular users still require email.

### Changed

- **Better validation error messages**: Create user form now parses Zod validation details and displays field-specific error messages instead of generic "Invalid request data".
- **Service accounts no longer require email**: Frontend form hides email/password/role fields entirely in Service Account mode, showing only Username and Token Name.

### Fixed

- **User list shows "No email" for service accounts**: Instead of displaying blank or undefined, service accounts with null email now show an italic "No email" label.
- **ShareDialog handles null email**: Contact autocomplete and share list fall back to username when email is null.

## [1.11.0] - 2026-03-01

### Added

- **Service account token-based authentication**: Service accounts now use auto-generated API tokens instead of passwords. When creating a service account via the admin panel, an API token is generated and displayed once — no password required.
- **Admin token management endpoints**: `GET/POST/DELETE /api/admin/service-accounts/:id/tokens` — admins can list, create, and revoke API tokens for service accounts
- **Token management modal**: Admin panel now shows a "Manage Tokens" button for service accounts, replacing the "Reset Password" button

### Fixed

- **Admin reset-password bug**: Fixed admin password reset route using wrong Zod schema (`resetPasswordSchema` with `token` field instead of `adminResetPasswordSchema` with `newPassword` field), which caused 400 errors

### Changed

- **Service account login blocked**: Service accounts can no longer log in via username/password — they must use API tokens
- **Service account password flows blocked**: `changePassword` and `resetUserPassword` now reject service accounts with clear error messages
- **Create user validation**: Password is now conditional — required for regular users, forbidden for service accounts. Service accounts accept optional `tokenName`, `tokenScopes`, and `tokenExpiresIn` fields.

### Security

- Existing service account passwords nullified via data migration (replaced with unusable `!service-account-no-password:` prefix)

## [1.10.1] - 2026-02-28

### Fixed

- **MCP search 500 error**: Fixed `operator does not exist: text = uuid` in search service raw SQL — replaced `::uuid` casts with `CAST(... AS uuid)` for Prisma parameter compatibility
- **MCP DELETE operations failing**: Fixed MCP client sending `Content-Type: application/json` on DELETE requests with no body, causing 400 errors on delete note/task/folder/tag/unshare

### Added

- Test coverage for MCP client HTTP headers (vitest)
- Regression tests for search service UUID cast

## [1.10.0] - 2026-02-27

### Changed

- **Self-hosted deploy**: Removed self-hosted runner deploy job from CI/CD — use cron-based polling or manual `docker compose pull && up -d` instead
- **Environment template**: Replaced verbose `.env.example` with a concise template matching `compose.prod.yml` variables
- **Deployment docs**: Rewrote `docs/deployment.md` as a standalone quick-start guide (no self-hosted runner dependency)

## [1.9.0] - 2026-02-27

### Added

- **Full MCP Capabilities**: Expanded MCP tools from 11 to 26 — Claude Code can now fully manage notes, tasks, folders, tags, and sharing
- **MCP Note Management**: List/filter notes (`notez_list_notes`), update (`notez_update_note`), delete (`notez_delete_note`), restore from trash (`notez_restore_note`)
- **MCP Task Management**: Full task updates (`notez_update_task`), delete tasks (`notez_delete_task`)
- **MCP Folder Management**: Create (`notez_create_folder`), rename/re-icon (`notez_update_folder`), delete (`notez_delete_folder`) folders
- **MCP Tag Management**: List all tags (`notez_list_tags`), rename (`notez_update_tag`), delete (`notez_delete_tag`) tags
- **MCP Sharing**: Share notes (`notez_share_note`), list shares (`notez_list_shares`), update permission (`notez_update_share`), unshare (`notez_unshare_note`)
- **MCP API Routes**: New backend endpoints — `GET/PATCH/DELETE /api/mcp/notes/:id`, `POST /api/mcp/notes/:id/restore`, `PATCH/DELETE /api/mcp/tasks/:id`, `POST/PATCH/DELETE /api/mcp/folders/:id`, `GET/PATCH/DELETE /api/mcp/tags/:id`, `POST/GET/PATCH/DELETE /api/mcp/notes/:id/shares`
- **Input validation hardening**: Content max 500K chars, description max 50K, tags max 50 per entity, empty update rejection, datetime validation on due dates

### Changed

- Renamed `notez_list_recent` → `notez_list_recent_notes` for clarity
- Renamed `notez_rename_tag` → `notez_update_tag` for naming consistency

### Removed

- Removed `notez_update_task_status` tool (superseded by `notez_update_task` which can change status along with other fields)

## [1.8.0] - 2026-02-27

### Changed

- **Public Readiness**: Scrubbed PII, internal hostnames, and hardcoded credentials from compose files, documentation, and test scripts
- **Security Defaults**: Removed all hardcoded secret fallbacks — `ENCRYPTION_KEY`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` now throw on missing values instead of falling back to insecure defaults
- **Governance Files**: Added root `LICENSE` (MIT), `SECURITY.md`, and `CONTRIBUTING.md`
- **Documentation**: Rewrote `README.md` to reflect current project state (React 19, TipTap, real-time collaboration, MCP integration)

### Removed

- Deleted stale files: `WORK_COMPLETE.md`, `.woodpecker.yml`, `test-auth-api.ps1`, `test-qodo-fixes.ps1`

## [1.7.0] - 2026-02-27

### Added

- **Token Management UI**: New "API Tokens" section in Settings — create, view, copy, and revoke API tokens from the browser instead of using curl commands
- **Token Reveal Flow**: Raw token shown once after creation with copy-to-clipboard and warning that it won't be displayed again
- **Setup Guide Panel**: Collapsible guide in the tokens settings showing how to configure Claude Code MCP integration with the generated token
- **npm-publishable notez-mcp**: Added `bin`, `files`, `engines`, `repository`, and `prepublishOnly` fields so the MCP server can be installed via `npx notez-mcp` or `npm install -g notez-mcp`
- **notez-mcp README**: Setup guide covering quick start, Claude Code configuration, all 11 tools, and token creation instructions

## [1.6.0] - 2026-02-28

### Added

- **MCP Integration**: Standalone MCP server package (`notez-mcp/`) that allows Claude Code and other MCP clients to read and manage notes and tasks via stdio transport
- **API Token System**: New `ApiToken` model with SHA-256 hashed `ntez_` prefixed tokens, scoped permissions (`read`/`write`), optional expiry, and revocation support
- **Token Management API**: JWT-protected endpoints (`POST/GET/DELETE /api/tokens`) for users to create, list, and revoke API tokens
- **MCP API Routes**: New `/api/mcp/*` endpoints authenticated via API tokens — notes (search, get, get-by-title, recent, create, append), tasks (list, get, create, update status), folders (list)
- **11 MCP Tools**: `notez_search_notes`, `notez_get_note`, `notez_get_note_by_title`, `notez_list_recent`, `notez_create_note`, `notez_append_to_note`, `notez_list_tasks`, `notez_get_task`, `notez_create_task`, `notez_update_task_status`, `notez_list_folders`
- **Auth Middleware**: `authenticateApiToken` and `requireScope` middleware for API token-based route protection

## [1.5.0] - 2026-02-27

### Added

- **Service Accounts**: New `isServiceAccount` flag on users — immutable after creation, set only at account creation time. Enables admin visibility into automated agent content while guaranteeing regular user privacy.
- **Admin Service Account Browsing**: Admins can view all service account notes and tasks in a read-only "Service Accounts" virtual folder in the sidebar (notes view + task list view)
- **Admin Panel Service Account Creation**: "Service Account" checkbox when creating users, with blue badge in user list for service accounts
- **Admin API Endpoints**: `GET /api/admin/service-accounts`, `/notes`, `/notes/:id`, `/tasks` — all admin-only, paginated
- **Data Migration**: Existing `claude-agent` user automatically flagged as service account on deploy

### Changed

- **Auth Response**: `/auth/me` now includes `isServiceAccount` field
- **User Stats**: Admin stats now include `serviceAccounts` count

## [1.4.1] - 2026-02-26

### Fixed

- **Shared Note Folder/Title/Tag Changes**: Metadata changes (folder, title, tags) on shared notes were silently dropped because auto-save skipped REST API entirely in collaborative mode — now only content save is skipped (Hocuspocus handles content), metadata saves via REST as normal
- **Kanban Board Completed Tasks**: Kanban view now has a "Show completed" toggle — previously always showed all tasks regardless of filter, inconsistent with the task list view
- **Modal Text Selection**: Selecting text in ShareDialog, ConfirmDialog, and WhatsNewModal no longer accidentally closes the dialog (switched backdrop from `onClick` to `onMouseDown`)
- **Note Update Permission Errors**: Backend now returns 403 Forbidden (not 500) when non-owners attempt folder changes on shared notes

## [1.4.0] - 2026-02-26

### Added

- **Global Error Boundary**: App-level React error boundary catches unhandled component crashes and shows a recovery UI ("Reload Page" / "Go Home") instead of a white screen
- **Toast Notification System**: User-facing toast notifications for success, error, warning, and info events — replaces silent `console.error` across 10+ components
- **Backend Safe Fire-and-Forget**: `safeFireAndForget()` utility wraps notification dispatches with nested try-catch to prevent unhandled promise rejections (including `JSON.stringify` failures)

### Fixed

- **Silent Error Failures**: 15+ operations across NoteEditor, FolderSidebar, NoteList, KanbanBoard, TaskList, AdminPanel, and ShareDialog now show user-visible error toasts instead of silently failing
- **Removed All alert() Calls**: Replaced 10 remaining `alert()` calls in FolderSidebar, NoteEditor, and AdminPanel with toast notifications for consistent UX
- **useMutation Error Handlers**: NotificationBell (3 mutations) and AdminFeedbackPanel (5 mutations) now display error toasts on failure
- **Collaboration Service Crash**: Database `fetch` and `store` operations in Hocuspocus extension wrapped in try-catch to prevent WebSocket server crashes on DB errors
- **WebSocket ZodError**: Invalid noteId in WebSocket URL now closes the socket with code 1008 (Policy Violation) instead of throwing an unhandled ZodError; unexpected errors close with 1011
- **Backend Error Response Format**: AI routes now include `error` field in all error responses, standardizing the `{ error, message }` shape across all backend routes
- **Production Console Noise**: ~50 `console.error`/`console.warn` calls across 16 frontend files wrapped in `import.meta.env.DEV` guards
- **Toast UX**: Added MAX_TOASTS cap (5) with oldest eviction, custom entrance animation, mobile bottom-nav offset, and fixed ARIA double-announcement
- **Sidebar ARIA Semantics**: FolderSidebar uses `<nav aria-label="...">` with `aria-current="page"` on active items in both collapsed and expanded views; removed redundant `role="navigation"`
- **Error Boundary Nesting**: GlobalErrorBoundary moved to outermost position to catch provider crashes
- **WCAG Focus Rings**: Toast dismiss button and error boundary "Go Home" link now show visible focus rings for keyboard navigation
- **FeedbackModal Error Toast**: Submit errors now show a user-visible toast instead of being silently swallowed
- **Sidebar Triple Toast Spam**: Folder/tag/stats load failures consolidated into a single toast per batch via `Promise.allSettled`
- **AI Inline Errors → Toast**: AI feature errors (summarize, suggest title, suggest tags) now display as toasts instead of inline `<span>` elements
- **Auto-Save Error Deduplication**: Repeated auto-save failures show only one toast instead of spamming on every retry
- **Tags Toggle ARIA**: Tags section toggle button now has `aria-expanded` and `aria-controls` for screen reader users
- **AI Content Max Length**: AI endpoint schemas now enforce a 50,000-character limit to prevent oversized payloads
- **AI Error Sanitization**: AI service errors return a fixed message instead of leaking internal error details to clients
- **AdminFeedbackPanel Delete Confirm**: Native `confirm()` replaced with styled `useConfirm()` dialog for delete action
- **Error Boundary Icon**: Replaced `<span>!</span>` with Lucide `AlertCircle` icon for visual consistency

## [1.3.3] - 2026-02-25

### Fixed

- **Feedback Submit**: Added proper error handling (`onError`) and robust error message extraction to the Suggest Feature / Report Bug modal — errors from network failures, server errors, and validation are now clearly displayed with `role="alert"` for accessibility

### Changed

- **CI Pipeline**: Added `test` job that runs backend and frontend test suites before Docker build — build now gates on all 388 tests passing

## [1.3.2] - 2026-02-25

### Added

- **Backend Test Suite**: 217 new tests across 9 test files covering all critical backend code paths
  - **Tier 1 — Pure Logic**: encryption roundtrip & tamper detection, JWT token generation/verification, all 20+ Zod validation schemas (password rules, safe URL checks, FOLDER_ICONS allowlist), task extraction from HTML/Markdown, custom error classes, filename sanitization
  - **Tier 2 — Services**: auth service (login, setup, token refresh, password reset with email enumeration prevention), note service (CRUD, access control for owner/shared/view-only, soft delete/restore, pagination), auth middleware (token extraction, DoS protection, admin gating, optional auth)

## [1.3.1] - 2026-02-24

### Added

- **"Shared" Sidebar Category**: New sidebar item showing all notes you've shared with others, with count badge and dedicated list view

### Changed

- **Shared Note Icons**: Redundant share arrow badge removed from note list — the blue double-document icon (`Files`) is sufficient alone
- **Share Button Icon**: Share button in note editor and share dialog now use the universal share arrow (`Share2`) icon instead of the people (`Users`) icon

## [1.3.0] - 2026-02-23

### Added

- **Auto-Select Title**: New notes auto-focus and select the "Untitled Note" title so users can immediately type a name
- **20 New Folder Icons**: Gaming (gamepad, trophy, swords, dice), finance (dollar sign, credit card), education (graduation cap, brain, flask), health (dumbbell), nature/travel (mountain, tree, plane), communication (mail, message), security (lock, shield), entertainment (headphones, TV), and tools (wrench) — 68 total icons

### Changed

- **Shared Note Icons**: Shared notes now display a distinct blue double-document icon (`Files`) in the note list, plus a share arrow (`Share2`) badge, making them instantly identifiable when scanning
- **Sidebar Order**: "Shared with me" moved from below Tags to directly after Tasks — primary views (All Notes, Tasks, Shared) now grouped together at the top of the sidebar
- **Collaborator Colors**: Replaced hash-to-HSL color generation with a curated 12-color palette for maximum visual distinction between collaborators (fixes near-identical colors for similar short usernames)
- **Icon Picker Scrolling**: Icon picker dropdown now scrolls when needed instead of overflowing the viewport

## [1.2.2] - 2026-02-23

### Fixed

- **Collaborative Editor Crash (Root Cause)**: Fixed the actual crash when opening shared notes — `@tiptap/extension-collaboration-cursor@3.0.0` depended on `y-prosemirror` (external), which conflicted with `@tiptap/y-tiptap` (TipTap's internal fork). Both defined `ySyncPluginKey('y-sync')` as different `PluginKey` instances, causing the Collaboration extension's options to be lost during extension resolution. Replaced both packages with a custom extension that imports `ySyncPlugin`, `yUndoPlugin`, and `yCursorPlugin` directly from `@tiptap/y-tiptap`.
- **Shared Editor Extensions**: All TipTap extensions now come from a single `editorExtensions.ts` module, preventing config divergence between collaborative and non-collaborative editors.
- **Link Extension Security**: Added protocol allowlist (`http`, `https`, `mailto`) and `rel="noopener noreferrer"` to all link elements.
- **Dual Undo System Conflict**: StarterKit's built-in `undoRedo` is now disabled in collaborative mode to prevent conflicts with Yjs undo.

### Removed

- Removed `@tiptap/extension-collaboration` — replaced by custom extension using `@tiptap/y-tiptap` directly
- Removed `@tiptap/extension-collaboration-cursor` — cursor plugin now imported from `@tiptap/y-tiptap`
- Removed `y-prosemirror` transitive dependency (source of the PluginKey conflict)

## [1.2.1] - 2026-02-22

### Fixed

- **Collaborative Editor Crash**: Fixed white screen crash when opening shared notes (provider sync race condition)
- **Collaborative Editor Auth Handling**: Auth failures now show clear error and stop reconnection attempts
- **Collaborative Editor Sync Timeout**: Added 15-second timeout with retry button when server is unreachable
- **Collaborative Editor Reconnect Stability**: Editor no longer tears down during transient WebSocket reconnects
- **Collaborative Editor noteId Validation**: Client-side UUID validation prevents malformed WebSocket URLs
- **Collaborative Editor Accessibility**: Added ARIA live regions, reduced-motion support, spinner aria-hidden, upload button labels
- **Image Upload Feedback**: Invalid file type/size and upload failures now show user-visible error messages

## [1.2.0] - 2026-02-21

**Real-Time Collaborative Note Sharing**

Share notes with other users and edit together in real-time with live cursors. This is the biggest feature since launch -- full Google Docs-style collaboration powered by Yjs CRDT, with granular VIEW/EDIT permissions and a dedicated "Shared with me" view.

### Added

- **Note Sharing**: Share any note with other users by username or email with VIEW or EDIT permissions
- **Real-Time Collaboration**: Simultaneous multi-user editing with Yjs CRDT conflict resolution (no data loss)
- **Live Cursors**: See collaborators' cursor positions with colored labels and usernames in real-time
- **Collaboration Presence**: See who is currently editing a shared note with colored avatar indicators
- **Share Management Dialog**: Full UI for sharing notes, changing permissions, and revoking access
- **Contacts Autocomplete**: Share dialog suggests previously shared-with users as you type, with keyboard navigation
- **"Shared with Me" Sidebar**: Dedicated section showing all notes shared with the current user
- **Share Indicators**: Notes shared with others display a users icon in the note list
- **Permission Badges**: View-only and shared-edit banners clearly indicate access level
- **Share Notifications**: Users receive a notification when a note is shared with them
- **Custom Scrollbars**: Thin, styled scrollbars throughout the app (Chrome, Firefox, Edge)
- **Resizable Panels**: Drag to resize sidebar and notes list panels (desktop only), widths persist in localStorage
- **Kanban Default View**: New desktop users now see Kanban board by default (existing preferences preserved)
- **Folder Icon Picker in Dropdown**: Select icon when creating folders inline from the dropdown

### Fixed

- **Notes Panel Resize**: Fixed notes list not resizing when dragging the resize handle
- **Folder Creation Overflow**: Redesigned inline folder creation dialog to fit within dropdown width
- **Search Debounce**: Note search now debounces at 300ms instead of firing on every keystroke
- **Empty State Messages**: Context-aware messages for shared, trash, and normal note list views

### Security

- **WebSocket Authentication**: JWT-authenticated WebSocket connections with UUID-validated note IDs
- **Granular Permissions**: Owner-only share management; VIEW users get read-only WebSocket connections
- **Deleted Note Protection**: Soft-deleted notes are excluded from share access checks and collaboration
- **Transaction-Safe Access Checks**: Note permission checks run inside database transactions to prevent race conditions
- **Search Query Hardening**: Maximum 500 character query length, 50 word limit, SQL pattern character escaping

### Technical

- New `NoteShare` and `NoteYjsState` database models with `SharePermission` enum
- Hocuspocus WebSocket server with Yjs persistence and document syncing
- Server-side TipTap for bidirectional markdown/Yjs document conversion
- Collaborative TipTap editor with Collaboration and CollaborationCursor extensions
- REST autosave automatically disabled when in collaborative mode
- 17 unit tests for share service permission logic

## [1.1.0] - 2026-01-22

**Task Enhancements Release**

This release focuses on improving the task management experience with new features for sorting, organization, and visualization, plus important bug fixes from user feedback.

### Added

- **Task Sorting**: Sort tasks by priority, due date, creation date, or title (ascending/descending)
- **Inline Folder Creation**: Create new folders directly from the folder dropdown without leaving the current form
- **Task Hyperlinks**: Attach up to 10 external URLs to tasks with optional titles
- **Kanban Board View**: Visual drag-and-drop board for managing tasks across status columns (Pending, In Progress, Completed, Cancelled)
- **Keyboard Navigation**: Move tasks between Kanban columns using arrow keys for accessibility

### Fixed

- **Task List Not Refreshing**: Task list now properly refreshes after creating, editing, or deleting tasks
- **Task Form Not Closing**: Modal now correctly closes after successful task creation/update
- **Overdue Badge Position**: Overdue indicator no longer causes layout shifts in task list
- **Task Actions Visibility**: Edit/delete buttons now always visible on mobile, hover-revealed on desktop
- **Task Edit/Delete on Mobile**: Action buttons properly sized and accessible on touch devices

### Security

- **URL Protocol Validation**: Task links now restricted to http/https only (blocks javascript:, data:, etc.)
- **Task Ownership Verification**: Link update/delete routes now verify the link belongs to the specified task

### Technical

- New `TaskLink` model with cascade delete
- Database indexes for priority and createdAt sorting
- Transaction-based link limit enforcement (max 10 per task)
- ARIA labels and roles for Kanban accessibility

## [1.0.1] - 2025-12-23

**User Notifications Expansion**

Extending the notification system to all users, not just admins. Users now receive notifications when their feedback status changes, and admins can send release notifications to announce new versions.

### Added

- **Feedback Status Notifications**: Users receive notifications when their bug report or feature request status changes (reviewed, approved, declined, published)
- **Release Notifications**: Admin endpoint to send new version announcements to all users
- **User-Facing Notification Bell**: All users now see the notification bell (previously admin-only)

### Changed

- Notification types updated: `NEW_FEEDBACK` (admin), `FEEDBACK_STATUS_CHANGE` (user), `NEW_RELEASE` (all users)

### Technical

- New `notifyUser()` and `notifyAllUsers()` functions in notification service
- New admin endpoint `POST /api/admin/notifications/release` for sending release notifications
- Updated `NotificationBell` component with new notification type icons

## [1.0.0] - 2025-12-22

**First Stable Release - User Feedback System & Phase 2 Features**

Notez reaches v1.0.0 with the addition of a comprehensive in-app feedback system, completing the core feature set. Users can now submit bug reports and feature requests directly within the app, with full admin tools to manage and track submissions.

### Added

- **User Feedback System**: Complete bug report and feature request submission system
  - Users can submit bugs or feature requests via modal accessible from user menu
  - Optional category selection (UI/UX, Editor, AI Features, Organization, Other)
  - Optional priority levels (Nice to Have, Helpful, Critical)
  - Rate limited to 10 submissions per hour per user
- **Admin Feedback Panel**: New Settings section for admins to manage feedback
  - Dashboard with stats cards (Total, Awaiting Review, Bugs, Features)
  - Clickable stats to filter submissions
  - Status workflow: New → Reviewed → Approved/Declined → Published
  - Admin notes with auto-save
  - "Mark as Shipped" functionality for completed features
  - Bulk filtering by type, status, and category
- **Admin Notifications**: Bell icon with unread count in header
  - Real-time notification when new feedback is submitted
  - Click notification to navigate directly to feedback item
  - Mark as read on click, mark all read option
- **Wiki-Links Backlinks System**: Find all notes that reference a given note
- **Load Testing Infrastructure**: k6-based load testing for performance validation

### Fixed

- **Session Refresh Race Condition**: Fixed Prisma error when multiple tabs refresh tokens simultaneously
- **Settings Navigation**: Changed from hash-based (`#section`) to route-based (`/settings/section`) navigation
- **Infinite Reload Loop**: Fixed Settings page reload issue caused by hash-based navigation

### Technical

- New `FeedbackSubmission` and `Notification` database models
- New `/api/feedback/*` endpoints for user submissions
- New `/api/admin/feedback/*` endpoints for admin management
- New `/api/notifications/*` endpoints for notification system
- Debounced auto-save for admin notes (1 second delay)
- TanStack Query mutations with proper cache invalidation

## [1.0.0-rc.2] - 2025-12-03

**Security Hardening Release**

Comprehensive security audit and hardening based on Qodo AI code review. This release addresses all identified security concerns and adds defense-in-depth measures across the application.

### Security

- **SQL Injection Prevention**: Replaced `$queryRawUnsafe` with parameterized `$queryRaw` using Prisma tagged template literals
- **Image Content Validation**: Added Sharp-based image parsing to prevent content-type spoofing attacks
- **Rate Limiting**: Added global rate limiting (100 req/min) with stricter limits on auth endpoints (5 req/15min)
- **Brute Force Protection**: Auth endpoints keyed by IP + username/email to prevent credential stuffing
- **Session Invalidation**: Logout now invalidates JWT by setting expiration in the past
- **Security Headers**: Added `X-Content-Type-Options: nosniff` to all image responses
- **File Size Limits**: Enforced server-side limits (10MB images, 5MB avatars)
- **Password Reset Protection**: Rate limited to 3 attempts per IP per 15 minutes

### Fixed

- Console warnings for form accessibility (missing `name` attributes)
- Duplicate CSS custom properties causing console noise
- TypeScript scope issues in catch blocks for structured logging

### Changed

- Collapsed sidebar now shows only folder icons (removed tag icons - all identical)
- Limited folder icons to 8 in collapsed mode with overflow indicator
- Overflow indicator expands sidebar when clicked

### Technical

- New `validateImageContent()` utility using Sharp for content validation
- New `ALLOWED_IMAGE_MIME_TYPES` constant for consistent validation
- Added `@fastify/rate-limit` plugin with custom error responses
- Improved logging in image upload/retrieval routes

## [1.0.0-rc.1] - 2025-12-02

**MVP Feature Complete - Release Candidate**

This release marks MVP completion per the original specification. All core features are implemented and the application is entering the validation phase for stability, security, and production readiness.

### Added

- **Self-Service Password Reset**: Forgot password flow with email-based reset tokens via Resend
- **Unified Settings Hub**: Consolidated Profile, AI Settings, and Admin Panel into single page with sidebar navigation
- **Shared App Header**: Consistent header with logo, search, theme toggle, and user dropdown across all pages
- **User Avatar Dropdown**: Click avatar to access Profile, Settings, Admin Panel (if admin), and Logout
- **Enhanced Collapsed Sidebar**: Folder/tag icons with hover popovers showing name and note count
- **Styled Confirm Dialogs**: Replaced native browser confirm() with themed React dialogs
- **Sidebar State Persistence**: Collapsed/expanded state saved to localStorage

### Changed

- Settings navigation uses URL hash for sections (`/settings#profile`, `/settings#ai`, `/settings#admin`)
- Trash moved to bottom of folder sidebar in both expanded and collapsed views
- Legacy routes `/profile` and `/admin` redirect to Settings Hub sections

### Fixed

- Trash folder 400 error when clicking trash icon in collapsed sidebar
- Folder icon picker overflow when editing folders (reduced width from 256px to 224px)

### Technical

- New `AppHeader` component for shared navigation
- New `SettingsHub` page with section-based routing
- New `AdminPanel` component extracted for reuse
- New `UserDropdown` component with avatar and menu
- New `ConfirmDialog` component with `ConfirmProvider` context
- Password reset tokens stored in database with 1-hour expiration
- Resend email integration for transactional emails

### MVP Status

All success criteria from the MVP specification have been met:
- ✅ Deploy to server via Docker
- ✅ Create admin account on first boot
- ✅ Login as admin or regular user
- ✅ Create, edit, delete notes with auto-save
- ✅ Organize notes in folders
- ✅ Tag notes
- ✅ Search notes
- ✅ AI summarize, suggest titles, suggest tags
- ✅ Create new users as admin
- ✅ Secure (JWT, encrypted secrets)
- ✅ CI/CD pipeline builds and pushes to ghcr.io

## [0.32.0] - 2025-12-02

### Added

- **User Avatar Upload**: Upload, change, or delete profile avatars (JPEG, PNG, GIF, WebP up to 5MB)
- **Dynamic AI Model Fetching**: Models now fetched from AI providers instead of static hardcoded lists
- **Model Deprecation Handling**: Graceful fallback when AI models are deprecated or removed
- **Profile Settings Tab**: New Profile section in Settings with user info and avatar management
- **PATCH Endpoint for AI Model**: Change AI model without re-entering API key

### Fixed

- **AI Config Bug**: Users can now change AI model without re-entering their API key
- Model selection persists correctly after configuration changes

### Technical

- Added `avatarUrl` field to User model with database migration
- New `/api/profile/*` endpoints for profile and avatar management
- Avatar images resized to 256x256 and stored as JPEG in MinIO
- Added `AIModelNotFoundError` for provider-specific error handling

## [0.31.1] - 2025-01-02

### Added

- **Image Upload Button**: Manual upload button in editor toolbar for adding images
- **Inline Image Resizing**: Drag handles to resize images directly in the editor
- Image width persists in markdown format for consistent rendering

### Security

- Fixed XSS vulnerability in image title attribute processing
- Added client-side file validation (10MB size limit, MIME type checking)
- Added URL protocol sanitization to block javascript: and other dangerous URLs
- Added HTML tag stripping for image alt/title attributes

## [0.31.0] - 2024-12-01

### Added

- **Image Support**: Paste, drag-drop, or upload images directly into notes
- **MinIO Storage Integration**: S3-compatible object storage for scalable image hosting
- **10 New Tech/Homelab Icons**: server, cpu, hard-drive, network, wifi, database, cloud, monitor, laptop, smartphone

### Changed

- Docker compose now includes MinIO service for image storage
- Images automatically optimized (resize, compress) on upload

### Technical

- Added `@tiptap/extension-image` for editor image support
- Added `@fastify/multipart` for file uploads
- New `Image` model in database schema for tracking image metadata

## [0.30.2] - 2024-11-30

### Added
- **Folder Chip UI**: Modern chip-style folder selector with icons in note editor
- **10 New Folder Icons**: palette, paintbrush, pencil, pen, pen-tool, flower, drama, coffee, utensils, gift

### Fixed
- Folder counts not updating when moving notes via editor dropdown
- Tag counts not refreshing after adding/removing tags from notes
- Folder icons now display in folder selector dropdown

## [0.30.1] - 2024-11-30

### Fixed
- Folders not loading after v0.30.0 update (missing database migration for icon column)

## [0.30.0] - 2024-11-30

### Added
- **Folder Icons**: Customize folder appearance with 27 different icons
- **What's New Modal**: Click version number to see release notes and update history
- **Version Badge**: "NEW" indicator shows when app has been updated

### Fixed
- Folder sidebar layout improvements for narrow widths
- Edit mode button overflow in sidebar items

## [0.29.1] - 2024-11-29

### Fixed
- TipTap editor scroll issue with absolute positioning
- Focus visibility improvements for accessibility

## [0.29.0] - 2024-11-28

### Added
- **Task Management System**: Full todo/task support with note integration
- Task import from existing notes with automatic parsing
- Task scanning to detect actionable items in notes

### Fixed
- API type mismatches between scan and import endpoints
- TypeScript build errors with Set type inference

## [0.28.3] - 2024-11-27

### Added
- Tiptap rich text editor with comprehensive markdown support
- Note organization improvements with drag-and-drop

### Fixed
- Mobile bottom navigation visibility
- Mobile responsiveness for large devices (Pixel Fold)
- Drag-and-drop security improvements
- Note editor layout issues

## [0.28.2] - 2024-11-26

### Fixed
- Docker build now correctly injects version from package.json
- Version display in UI shows correct build version

## [0.28.1] - 2024-11-25

### Fixed
- Critical production authentication issues
- Cookie handling behind reverse proxy (Cloudflare Tunnel)

### Added
- Trash/soft delete system for notes
- Unfiled notes indicator in sidebar

## [0.28.0] - 2024-11-24

### Added
- AI-powered tag suggestions that prefer existing tags
- Improved tag suggestion scalability (limited to 50 most recent)

### Fixed
- Frontend data refresh issues
- API base URL for production deployment
- Prisma migrations included in version control

## [0.27.0] - 2024-11-23

### Added
- Initial public release
- Note creation and editing with markdown support
- Folder organization system
- Tag management
- AI-powered features (summarization, tag suggestions)
- Dark mode support
- Docker deployment support
- Multi-user authentication

[Unreleased]: https://github.com/SpasticPalate/notez/compare/v1.10.1...HEAD
[1.10.1]: https://github.com/SpasticPalate/notez/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/SpasticPalate/notez/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/SpasticPalate/notez/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/SpasticPalate/notez/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/SpasticPalate/notez/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/SpasticPalate/notez/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/SpasticPalate/notez/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/SpasticPalate/notez/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/SpasticPalate/notez/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/SpasticPalate/notez/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/SpasticPalate/notez/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/SpasticPalate/notez/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/SpasticPalate/notez/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/SpasticPalate/notez/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/SpasticPalate/notez/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/SpasticPalate/notez/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/SpasticPalate/notez/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/SpasticPalate/notez/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/SpasticPalate/notez/compare/v1.0.0-rc.2...v1.0.0
[1.0.0-rc.2]: https://github.com/SpasticPalate/notez/compare/v1.0.0-rc.1...v1.0.0-rc.2
[1.0.0-rc.1]: https://github.com/SpasticPalate/notez/compare/v0.32.0...v1.0.0-rc.1
[0.32.0]: https://github.com/SpasticPalate/notez/compare/v0.31.1...v0.32.0
[0.31.1]: https://github.com/SpasticPalate/notez/compare/v0.31.0...v0.31.1
[0.31.0]: https://github.com/SpasticPalate/notez/compare/v0.30.1...v0.31.0
[0.30.1]: https://github.com/SpasticPalate/notez/compare/v0.30.0...v0.30.1
[0.30.0]: https://github.com/SpasticPalate/notez/compare/v0.29.1...v0.30.0
[0.29.1]: https://github.com/SpasticPalate/notez/compare/v0.29.0...v0.29.1
[0.29.0]: https://github.com/SpasticPalate/notez/compare/v0.28.3...v0.29.0
[0.28.3]: https://github.com/SpasticPalate/notez/compare/v0.28.2...v0.28.3
[0.28.2]: https://github.com/SpasticPalate/notez/compare/v0.28.1...v0.28.2
[0.28.1]: https://github.com/SpasticPalate/notez/compare/v0.28.0...v0.28.1
[0.28.0]: https://github.com/SpasticPalate/notez/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/SpasticPalate/notez/releases/tag/v0.27.0

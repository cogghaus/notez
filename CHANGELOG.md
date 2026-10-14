# Changelog

All notable changes to Notez will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.31.0] - 2026-10-13

### Added

- Task status **WAITING** (with an optional `waitingOn` note: who or what the task waits on). WAITING counts as open: it shows in the default task list, has its own Kanban lane after In Progress, a Waiting count in the task stats and an hourglass icon; clicking it moves the task back to In Progress.
- Task **`startDate`** ("do not start before"), sortable (`sortBy=startDate`); it must not be after the due date when both are sent.
- Task **sync identity** `source` + `externalId` for tasks filed by other systems (Foyer first). Unique per user, set together at creation, never changed; a duplicate create answers 409, so a retried create can never file a task twice. New `GET /api/v1/tasks/by-external-id?source=&externalId=`.
- **Subtasks**, one level deep: `parentTaskId` on create and update. A subtask cannot have subtasks and a task with subtasks cannot become one; deleting a parent keeps its subtasks as top-level tasks. A single task returns its `parent` and `subtasks`; list items return `parent`.
- External API (`/api/v1`, `/api/mcp`): `GET /tasks` takes a comma-separated `status` list, `source`, `externalId`, `parentTaskId`, `folderId`, `sortBy`, `sortOrder`, `offset` and `limit` up to 100; `POST /tasks` takes `status`, `noteId`, `links`, `waitingOn`, `startDate`, `parentTaskId`, `source`, `externalId`; `PATCH /tasks/:id` takes the same minus the sync identity, plus `links` (replace all); `PATCH /tasks/:id/status` accepts WAITING.
- `/health` returns `version`, so API clients can check which features the server has.
- Remote MCP tools and the `notez-mcp` package (1.14.0): WAITING everywhere; `notez_create_task` and `notez_update_task` take the new fields; `notez_list_tasks` filters by `source`, `externalId` and `parentTaskId`.

### Changed

- Database migration `20261013000000_task_waiting_source_start_parent`: additive only (one enum value, five nullable columns, one unique index, one index, one foreign key). Back up before deploying (see `DEPLOYMENT.md`).
- Task create and update through the web app now answer 409, 400 or 404 for these rules instead of a generic 500.
- Task list `offset` is capped at 100000 (session and external API).
- A task link that is not http or https is shown as plain text, never as a clickable link (defence in depth; the API already refuses such links).

### Fixed

- A task created with status COMPLETED (now possible through the external API and MCP) gets `completedAt`, as a task completed later does.

## [1.30.7] - 2026-10-13

### Changed

Dependency sweep: minor and patch updates only, replacing the open Dependabot PRs. No majors. Versions published in the last 14 days were skipped unless they are security fixes (marked "security").

- backend: `@anthropic-ai/sdk` 0.124.0 to 0.129.0, `@fastify/jwt` 10.2.2 to 10.2.4 (security), `@fastify/static` 10.1.3 to 10.1.6 (security), `@fastify/websocket` 11.3.0 to 11.3.1, `@modelcontextprotocol/sdk` 1.30.0 to 1.31.0, `fastify` 5.12.3 to 5.12.5 (security), `resend` 6.26.0 to 6.31.0, `sharp` 0.35.4 to 0.35.5, `yjs` 13.6.32 to 13.6.33, `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` 8.66.0 to 8.71.0, `tsx` 4.23.11 to 4.23.15.
- backend, transitive (security): `fast-jwt` 6.3.4, `ip-address` 10.7.4, `@fastify/busboy` 3.2.3, `@grpc/grpc-js` 1.14.6, `source-map-js` 1.2.2, `fast-uri` 3.1.8 and 4.2.2, `proxy-addr` 2.0.8, `brace-expansion` 1.1.21; other in-range transitive packages refreshed to versions at least 14 days old.
- frontend: `@tanstack/react-query` 5.102.8 to 5.104.0, `dompurify` 3.4.15 to 3.4.17 (security), `react` and `react-dom` 19.2.8 to 19.3.0, `react-router-dom` 7.18.3 to 7.18.4, `yjs` 13.6.32 to 13.6.33, `@testing-library/jest-dom` 6.9.1 to 6.10.0, `@types/node` 24.13.3 to 24.19.0, `@types/react` and `@types/react-dom` to 19.3.0, `autoprefixer` 10.5.5 to 10.6.1, `eslint-plugin-react-refresh` 0.5.6 to 0.5.7, `typescript-eslint` 8.69.0 to 8.71.0, `vite` 8.2.2 to 8.3.1.
- frontend, transitive (security): `undici` 7.30.0, `brace-expansion` 1.1.21, `source-map-js` 1.2.2.
- notez-mcp: `@modelcontextprotocol/sdk` 1.30.0 to 1.31.0; transitive (security) `ip-address` 10.7.4, `fast-uri` 3.1.8, `proxy-addr` 2.0.8, `source-map-js` 1.2.2.

## [1.30.6] - 2026-10-12

### Testing

- New `.github/workflows/e2e.yml`: the frontend Playwright e2e runs in CI on GitHub-hosted Ubuntu (Chromium only, hermetic, no backend) for pull requests and pushes to main that touch `frontend/`, as its own check. Actions pinned by commit SHA; Playwright results uploaded on failure (7 days). Closes known issue #71.
- `frontend/playwright.config.ts`: `forbidOnly` when `CI` is set, so a stray `test.only` fails CI instead of running one test.

### Documentation

- Known issue #72: Node 20 (end of life 2026-04-30) in the Dockerfile and both workflows.

## [1.30.5] - 2026-10-12

### Fixed

- Mobile editor: notes stay scrollable and the caret stays visible while the on-screen keyboard is open (mobile rework PR1, `docs/mobile/03-build-plan.md`). The editor shell was sized with `100vh`, which Chrome on Android does not shrink for the keyboard, so the bottom of the note and the caret ended up behind it. The shell now follows the visible height (`--app-h`, written by `frontend/src/lib/viewport.ts` from `visualViewport`), and the note body is a single shrinkable flex scroller in the formatted, collaborative and raw editors. The caret is scrolled back into view after the visible height changes (Tiptap and Monaco).
- Keyboard detection (`html[data-kb]`) works whether the browser shrinks only the visual viewport (Chrome default) or the layout viewport too (`interactive-widget=resizes-content`, Gecko): it compares the visible height with the full height recorded per screen width, survives rotating or unfolding with the keyboard up, ignores pinch zoom, and never fires on devices without a touch screen or while no text field has focus.
- Task form and task import dialogs cap their height at the visible height.

### Changed

- Minimal writing mode below 1280px: with the keyboard open and focus in the note editor, the app header, the folder, tag and AI rows, the word count footer and the bottom navigation are hidden, so the note gets the visible area (measured 76 to 88 percent of it, against 0 to 62px of note before on browsers that resize the layout viewport). Everything returns when focus leaves the editor. Status banners (view-only, shared, service account, trash), the title row and the save state stay visible. The full writing mode of the mobile spec (section 5.3) replaces this in PR4.
- Viewport meta: `viewport-fit=cover, interactive-widget=resizes-content`.
- `body` minimum height follows the visible height.

### Testing

- Playwright 1.63.0 (pinned) e2e, `frontend/e2e/editor-keyboard.spec.ts`: hermetic (API mocked), runs at the four device-matrix viewports in both keyboard modes with a controllable fake `visualViewport`. `npm run test:e2e`; type-checked in CI via `npm run typecheck:e2e` (known issue #71: the e2e itself does not run in CI yet).
- Unit tests for the viewport module and the viewport-height hook.

### Documentation

- `docs/mobile/02-mobile-design-spec.md` section 2.2: as-built keyboard detection model.
- Known issues #70 (dev compose backend lacks `tsx`) and #71 (e2e not in CI).

## [1.30.4] - 2026-10-11

### Documentation

- New `docs/mobile/`: mobile layout rework design session. `01-audit-and-decisions.md` (device matrix with measured Pixel Fold readings, audit of v1.30.2 at phone and foldable sizes, decisions D1 to D14, open questions for Pam), `02-mobile-design-spec.md` (layout classes, keyboard-aware viewport model, navigation and back stack, editor writing mode, tasks agenda with quick add and soft delete, accessibility rules; reviewed against WCAG 2.1 AA), `03-build-plan.md` (ten PR-sized phases with acceptance criteria, editor keyboard scroll fix first). No code changes.
- New `mockups/mobile/`: `prototype.html` (interactive responsive prototype, fake data) and `device-check.html` (on-device viewport, keyboard and scroll-bug check).
- `docs/roadmap.md`: section 4.5 Mobile Web Rework (v1.31); task search and expanded task list requests linked to the plan.
- `.nojekyll` at the repo root so GitHub Pages serves the mockups as static files.

## [1.30.3] - 2026-10-11

### Changed

- `compose.prod.yml`: the two bind-mount volume sources take optional `POSTGRES_DATA_DIR` / `MINIO_DATA_DIR`, falling back to the previous `${DATA_DIR:-/opt/notez}/data/{postgres,minio}`. Existing installs resolve to exactly the same paths (nested-default resolution checked with and without each override). Lets a host with a different layout run the repo file unmodified.

### Documentation

- `docs/deployment.md`: new Secrets section (what each server secret does and its rotation trap; the cogg.haus deployment's secrets now live in Infisical and the server `.env` is generated, with the generator and drift check in homelab-docs). Secret generation switched to `openssl rand -hex 32` because base64 `/` and `+` break `DATABASE_URL`. Auto-update note corrected: the cron also recreates the backend when `.env` or the compose file changes, so installing a changed `.env` is a deploy.
- New `docs/runbooks/secret-rotation.md`: per-secret rotation procedure with proof-of-death checks. Traps recorded: `ENCRYPTION_KEY` (only its first 32 characters are used; changing it without re-encryption makes stored AI provider keys and webhook secrets undecryptable, and webhooks then auto-disable), `POSTGRES_PASSWORD` (the database keeps the old password: needs `ALTER ROLE`; loopback is `trust`, so old-password tests must go over the network with a control), `JWT_REFRESH_SECRET` / `COOKIE_SECRET` (sign everyone out; rotate together), `MINIO_SECRET_KEY` (MinIO and backend must restart together), Resend and Pocket ID (revoke the old value at the provider).
- `.env.example` and `backend/.env.example`: SSO variables added (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REQUIRED_GROUP`), plus the optional data-dir overrides. Closes known issue #65.
- Known issue #66 closed (server compose drift, missing homelab-docs stack entry).

## [1.30.2] - 2026-10-11

### Changed

- Dev `compose.yml` no longer inlines credentials: every credential key uses `${KEY:-<existing placeholder>}`, and `DATABASE_URL` now takes its user and password from the same `POSTGRES_USER` / `POSTGRES_PASSWORD` defaults, so overriding the password can no longer leave the URL out of step. With nothing set, the effective config is byte-identical (sha256 compared). Local development only; `compose.prod.yml` already interpolated everything. Closes known issue #63, whose gitleaks-allowlist half turned out to be on main already (via #40).

## [1.30.1] - 2026-10-08

### Documentation

- `docs/known-issues.md`: outstanding items found while shipping v1.30.0, numbered #63 to #69: local commits that never reached main (gitleaks allowlist, dev compose credential interpolation), backend `tsc` running out of memory with no typecheck in CI, SSO variables missing from the `.env.example` templates, server compose drift and no homelab-docs stack entry, no uptime monitor for the app (health endpoint is `GET /health`), untriaged Dependabot alerts, and pre-existing frontend lint errors with no lint step in CI. No code changes.

## [1.30.0] - 2026-10-08

### Added

- **Single sign-on with Pocket ID (OpenID Connect)** alongside password login. The login page shows "Sign in with Pocket ID" when the server is configured; password login is unchanged.
  - New endpoints: `GET /api/auth/oidc/config` (is SSO enabled), `GET /api/auth/oidc/login` (starts the authorization-code flow with PKCE, state and nonce held in a signed, httpOnly 10-minute cookie), `GET /api/auth/oidc/callback` (validates via `openid-client` v6, issues a normal Notez session, redirects to `/login?sso=complete`; failures redirect to `/login?sso_error=<code>`).
  - Account matching: first SSO login links the existing **regular** user with the same provider-verified email (case-insensitive) and stores the provider `sub`; later logins match on `sub` only. Admin accounts are never linked by email (`sso_error=link_required`); they connect from Settings, Profile. `POST /api/auth/oidc/link` (authenticated) starts the flow; the callback does not link, it holds the verified identity in a signed 5-minute cookie and returns to `/settings/profile?sso_link=confirm`, where the page calls `POST /api/auth/oidc/link/confirm` with the signed-in user's token. The link is made only if that user is the one who started it, so a Connect abandoned on a shared browser cannot be finished by someone else. Unknown identities get a regular (non-admin) user, username from `preferred_username` (sanitised, reserved names skipped case-insensitively, numeric suffix on collision). Service accounts, deactivated users, accounts linked to a different `sub`, and identities without a verified email are refused.
  - Access is gated by group membership: the provider restricts the client to a group, and optional `OIDC_REQUIRED_GROUP` checks the `groups` claim server-side as well.
  - The transaction and pending-link cookies are `__Host-oidc_tx` / `__Host-oidc_link` in production (Secure, host-only, `Path=/`) so a sibling subdomain cannot plant one (login CSRF by cookie tossing); they are cleared with the same attributes, and on logout.
  - A malformed `APP_URL` or `OIDC_ISSUER` disables SSO with a warning instead of failing requests.
  - `GET /api/auth/me` now includes `oidcLinked` (boolean; the subject itself is not exposed).
  - Discovery uses a 10-second timeout and is retried on the next attempt after a failure.
  - New env vars: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, optional `OIDC_REQUIRED_GROUP` (plus existing `APP_URL`). SSO is off unless the first three and `APP_URL` are set. See `docs/deployment.md`.

### Changed

- `auth.service.createUserSession()` now issues sessions for both password login and SSO.

### Database

- Migration `20261008000000_add_user_oidc_subject`: adds nullable `users.oidc_subject` with a unique index. Additive; existing rows are untouched.

## [1.29.0] - 2026-08-02

### Added

- **Filter tasks by folder** — selecting a folder in the sidebar while in Tasks view now filters the task list to tasks belonging to that folder. Switching between notes and tasks views preserves the folder context. Virtual folders (Unfiled, Trash, Shared, etc.) continue to switch to the notes view as before. Frontend only — no backend changes (the `folderId` query param on `GET /api/tasks` was already supported).

## [1.28.0] - 2026-08-02

### Added

- **Copy image to clipboard** — hover over any embedded image in a note to reveal a "Copy" button. Clicking it fetches the image and writes it to the system clipboard via the Clipboard API, ready to paste into other apps. Shows a brief "Copied!" confirmation or "Failed" on error. Requires HTTPS and browser clipboard permission.

## [1.27.1] - 2026-08-01

### Changed

- **Repository moved to `github.com/cogghaus/notez`.** Clone URLs, the security advisory link, the What's New footer link, and the `notez-mcp` package repository field now point at the new owner. The production image path moves from `ghcr.io/spasticpalate/notez` to `ghcr.io/cogghaus/notez`; the old namespace no longer resolves.
- LICENSE copyright holder normalised to Adam Coggins.

## [1.27.0] - 2026-04-14

### Added

- **OpenTelemetry instrumentation** — backend now ships traces, metrics, and logs to the homelab OTel Collector (OpenObserve backend) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Uses `@opentelemetry/auto-instrumentations-node` for zero-code instrumentation of Fastify, HTTP, Postgres/Prisma, and outbound fetch. Set `OTEL_SDK_DISABLED=true` to opt out.
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

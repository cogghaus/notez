// Changelog data for What's New modal
// This is a simplified representation of CHANGELOG.md for UI display

export interface ChangelogEntry {
  version: string;
  date: string;
  added?: string[];
  fixed?: string[];
  changed?: string[];
  removed?: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.27.1',
    date: '2026-08-01',
    changed: [
      'Notez has moved to github.com/cogghaus/notez — links in this dialog now point at the new home',
    ],
  },
  {
    version: '1.27.0',
    date: '2026-04-14',
    added: [
      'Ask Claude to attach links to tasks, check notifications, and submit feedback — all via natural conversation',
      'Claude can now summarize notes, suggest titles, and suggest tags using your configured AI provider',
    ],
  },
  {
    version: '1.26.0',
    date: '2026-04-13',
    fixed: [
      'Connecting to Claude is now seamless and no longer requires admin approval each time',
    ],
  },
  {
    version: '1.25.0',
    date: '2026-04-13',
    fixed: [
      'Fixed connection flow for Claude.ai connector setup',
    ],
  },
  {
    version: '1.24.0',
    date: '2026-04-13',
    added: [
      'Admins can now approve and manage MCP connectors from Settings > MCP Connectors',
      'Notification when a new app requests to connect via MCP',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-04-12',
    added: [
      'Connect Notez to Claude on mobile and web via claude.ai Settings > Connectors',
      'Ask Claude about your notes and tasks from your phone, tablet, or browser',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-04-06',
    added: [
      'My Agents — create named agent tokens with custom icons and colors from Settings',
      'Edit agent display config (name, icon, color) anytime without revoking the token',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-04-05',
    added: [
      'Agent accounts foundation — API tokens can now be designated as agents with a custom name, icon, and color',
      'Content created by agents is automatically attributed for future visibility features',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-04-05',
    added: [
      'Service Account Dashboard — admins now see a card-based overview with stats, health badges, and recent activity for each service account',
      'Service Account Workspace — drill into any service account to browse its folders, tags, and notes with search and pagination',
      'Activity Timeline — see what each service account has been doing in a reverse-chronological stream with smart grouping and filters',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-03-08',
    added: [
      'Webhooks — register an HTTPS endpoint and receive real-time push notifications whenever tasks, notes, or folders change',
      'Manage webhooks from Settings → Webhooks: register, test, pause, view the delivery log, and replay failed events',
      'Every webhook delivery is HMAC-SHA256 signed so you can verify it came from Notez',
      'Automatic retry with exponential backoff — up to 7 attempts over ~17 hours if your endpoint is down',
      'Bulk event replay to catch up after downtime (pick a time range and re-fire matching events)',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-03-07',
    added: [
      'Click-to-copy button on code blocks — hover over any code block to reveal a Copy button',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-03-06',
    added: [
      'API tokens now work at /api/v1/ — a stable, versioned endpoint for external integrations',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-03-04',
    added: [
      'QR code displayed when generating API tokens — scan with a mobile app instead of copy-pasting',
      'Token display auto-clears after 5 minutes for security, with a 30-second warning',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-03-01',
    added: [
      'Change your username from Profile Settings',
    ],
    fixed: [
      'Improved keyboard navigation and screen reader support across admin modals',
      'Admin modals now close when clicking outside or pressing Escape, and auto-focus the first input',
      'Service account profiles no longer show email and password sections',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-03-01',
    added: [
      'Redesigned account creation with a cleaner User / Service Account toggle',
      'Service accounts no longer require an email address',
      'Better error messages when creating accounts',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-03-01',
    added: [
      'Service accounts now use API tokens instead of passwords',
      'Admins can manage API tokens for service accounts from the admin panel',
    ],
    fixed: [
      'Admin password reset now works correctly',
    ],
  },
  {
    version: '1.10.1',
    date: '2026-02-28',
    fixed: [
      'MCP search now works correctly',
      'MCP delete operations for notes, tasks, folders, and tags now work correctly',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-02-27',
    changed: [
      'Infrastructure improvements',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-02-27',
    added: [
      'Full MCP capabilities: Claude Code can now edit, delete, organize, tag, and share your notes and tasks',
      'Browse notes by folder or tag via MCP',
      'Folder management via MCP: create, rename, and delete folders',
      'Tag management via MCP: list, rename, and delete tags',
      'Note sharing via MCP: share notes with other users directly from Claude Code',
      'Restore deleted notes from trash via MCP',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-02-27',
    changed: [
      'Preparing for open source release',
      'Improved security defaults for self-hosted deployments',
      'Updated project documentation',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-02-27',
    added: [
      'API Token Management: Create, view, and revoke API tokens directly from Settings — no more curl commands needed',
      'Setup Guide: Step-by-step instructions for connecting Claude Code to your Notez instance via MCP',
      'npx notez-mcp: The MCP server package can now be installed and run directly with npx',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-02-28',
    added: [
      'MCP Integration: Claude Code can now read and manage your notes and tasks via the Model Context Protocol',
      'API Tokens: Create scoped API tokens for external integrations (manage via API)',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-02-27',
    added: [
      'Service Accounts: Admins can now browse notes and tasks created by automated service accounts in a dedicated read-only sidebar section',
      'Admin Panel: Create service account users with a checkbox — service accounts are clearly badged in the user list',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-02-26',
    added: [
      'Kanban Board: "Show completed" toggle to hide or show completed and cancelled columns',
    ],
    fixed: [
      'Shared Notes: Folder, title, and tag changes now save correctly on shared notes',
      'Dialogs: Text selection no longer accidentally closes Share, Confirm, and What\'s New dialogs',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-02-26',
    added: [
      'Error Recovery: App now shows a recovery screen instead of crashing on unexpected errors',
      'Toast Notifications: Failed operations now show visible error messages instead of silently failing',
    ],
    fixed: [
      'Improved error handling across save, load, delete, and share operations',
      'Stability and security improvements',
      'Accessibility improvements for keyboard and screen reader users',
    ],
  },
  {
    version: '1.3.3',
    date: '2026-02-25',
    fixed: [
      'Feedback Submit: Error handling and error message display improved — network failures, server errors, and validation errors now clearly shown',
    ],
    changed: [
      'CI Pipeline: Test suite (388 tests) now runs before Docker build — broken code can no longer ship',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-02-25',
    added: [
      'Backend Test Suite: 217 new tests across 9 files — encryption, JWT, validation schemas, task extraction, auth service, note service, and middleware',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-02-24',
    added: [
      '"Shared" sidebar: See all notes you\'ve shared with others at a glance, with count badge',
    ],
    changed: [
      'Shared Note Icons: Redundant share badge removed from note list — the blue double-document icon is sufficient',
      'Share Button Icon: Share button and dialog now use the universal share arrow icon instead of the people icon',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-02-23',
    added: [
      'Auto-Select Title: New notes auto-focus and select "Untitled Note" title for immediate renaming',
      '20 New Folder Icons: Gaming (gamepad, trophy, swords, dice), finance, education, health, nature, travel, communication, security, entertainment, and tools categories — 68 total',
    ],
    changed: [
      'Shared Note Icons: Shared notes now show a distinct double-document icon in blue, plus the universally recognized share arrow badge',
      'Sidebar Order: "Shared with me" moved to top section (after Tasks) for faster access',
      'Collaborator Colors: 12-color curated palette replaces hash-to-HSL for better visual distinction between collaborators',
      'Icon Picker: Dropdown now scrolls when needed to prevent viewport overflow',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-02-23',
    fixed: [
      'Collaborative Editor: Fixed the root cause crash when opening shared notes (package version conflict)',
      'Collaborative Editor: Shared editor extensions now use a single source of truth',
      'Collaborative Editor: Link extension hardened with protocol allowlist',
      'Collaborative Editor: Dual undo system conflict resolved',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-02-22',
    fixed: [
      'Collaborative Editor: Fixed white screen crash when opening shared notes',
      'Collaborative Editor: Auth failures now show clear error instead of infinite loading',
      'Collaborative Editor: Added 15-second timeout with retry when server is unreachable',
      'Collaborative Editor: Editor stays stable during brief connection interruptions',
      'Image Upload: Invalid file type/size now shows error message instead of silently failing',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-02-21',
    added: [
      'Note Sharing: Share notes with other users by username or email with VIEW or EDIT permissions',
      'Real-Time Collaboration: Edit notes simultaneously with live conflict resolution (no data loss)',
      'Live Cursors: See collaborators\' cursor positions with colored labels and usernames',
      'Collaboration Presence: See who is currently editing a shared note',
      'Share Management Dialog: Share notes, change permissions, and revoke access',
      'Contacts Autocomplete: Share dialog suggests previously shared-with users as you type',
      '"Shared with Me" Sidebar: Dedicated section showing notes shared with you',
      'Share Indicators: Shared notes display a users icon in the note list',
      'Permission Badges: View-only and shared-edit banners indicate access level',
      'Share Notifications: Get notified when someone shares a note with you',
    ],
    fixed: [
      'Search Debounce: Note search now debounces instead of firing on every keystroke',
      'Empty State Messages: Context-aware messages for shared, trash, and normal views',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-01-22',
    added: [
      'Task Sorting: Sort tasks by priority, due date, creation date, or title',
      'Inline Folder Creation: Create new folders directly from the folder dropdown with icon picker',
      'Task Hyperlinks: Attach up to 10 external URLs to tasks with optional titles',
      'Kanban Board View: Visual drag-and-drop board for managing tasks across status columns',
      'Keyboard Navigation: Move tasks between Kanban columns using arrow keys',
      'Custom Scrollbars: Thin, styled scrollbars throughout the app',
      'Resizable Panels: Drag to resize sidebar and notes list (widths persist)',
      'Kanban Default: Desktop users now see Kanban board by default',
    ],
    fixed: [
      'Task List Not Refreshing: Task list now properly refreshes after creating, editing, or deleting tasks',
      'Task Form Not Closing: Modal now correctly closes after successful task creation/update',
      'Overdue Badge Position: Overdue indicator no longer causes layout shifts',
      'Task Actions Visibility: Edit/delete buttons now always visible on mobile',
      'Task Edit/Delete on Mobile: Action buttons properly sized and accessible on touch devices',
      'Notes Panel Resize: Fixed notes list not responding to resize handle',
      'Folder Creation Dialog: Redesigned to fit within dropdown width',
      'Search Security: Query length limits and SQL pattern escaping',
    ],
  },
  {
    version: '1.0.1',
    date: '2025-12-23',
    added: [
      'User Notifications: Get notified when your feedback status changes (reviewed, approved, etc.)',
      'Release Notifications: All users receive notifications about new app versions',
    ],
    changed: [
      'Notification Bell: Now visible for all users (not just admins)',
    ],
  },
  {
    version: '1.0.0',
    date: '2025-12-22',
    added: [
      'User Feedback System: Submit bug reports and feature requests directly in the app',
      'Admin Feedback Panel: Dashboard with stats, status workflow, admin notes with auto-save',
      'Admin Notifications: Bell icon with unread count, click to navigate to feedback items',
      'Wiki-Links Backlinks System: Find all notes that reference a given note',
      'Load Testing Infrastructure: k6-based load testing for performance validation',
    ],
    fixed: [
      'Session Refresh Race Condition: Fixed error when multiple tabs refresh tokens simultaneously',
      'Settings Navigation: Changed from hash-based to route-based navigation',
      'Infinite Reload Loop: Fixed Settings page reload issue',
    ],
  },
  {
    version: '1.0.0-rc.1',
    date: '2025-12-02',
    added: [
      'MVP Feature Complete! All core features implemented and ready for validation',
      'Self-Service Password Reset: Forgot password flow with email-based reset tokens',
      'Unified Settings Hub: Profile, AI Settings, and Admin Panel in one place with sidebar navigation',
      'Shared App Header: Consistent header with logo, search, theme toggle, and user dropdown',
      'User Avatar Dropdown: Quick access to Profile, Settings, Admin Panel, and Logout',
      'Enhanced Collapsed Sidebar: Folder/tag icons with hover popovers showing name and count',
      'Styled Confirm Dialogs: Themed React dialogs replace native browser confirms',
      'Sidebar State Persistence: Collapsed/expanded state saved to localStorage',
    ],
    changed: [
      'Trash moved to bottom of folder sidebar in both views',
      'Settings navigation uses URL hash for sections',
    ],
    fixed: [
      'Trash folder 400 error in collapsed sidebar',
      'Folder icon picker overflow when editing folders',
    ],
  },
  {
    version: '0.32.0',
    date: '2025-12-02',
    added: [
      'User Avatar Upload: Upload, change, or delete profile avatars',
      'Dynamic AI Model Fetching: Models now fetched from AI providers instead of static lists',
      'Model Deprecation Handling: Graceful fallback when AI models are deprecated',
      'Profile Settings Tab: New Profile section with user info and avatar management',
    ],
    fixed: [
      'AI Config Bug: Can now change AI model without re-entering API key',
      'Model selection persists correctly after configuration changes',
    ],
  },
  {
    version: '0.31.0',
    date: '2024-12-01',
    added: [
      'Image Support: Paste, drag-drop, or upload images directly into notes',
      'MinIO Storage: S3-compatible object storage for scalable image hosting',
      '10 New Tech/Homelab Icons: server, cpu, hard-drive, network, wifi, database, cloud, monitor, laptop, smartphone',
    ],
    changed: [
      'Docker compose now includes MinIO service for image storage',
      'Images automatically optimized (resize, compress) on upload',
    ],
  },
  {
    version: '0.30.2',
    date: '2024-11-30',
    added: [
      'Folder Chip UI: Modern chip-style folder selector with icons in note editor',
      '10 New Folder Icons: palette, paintbrush, pencil, pen, pen-tool, flower, drama, coffee, utensils, gift',
    ],
    fixed: [
      'Folder counts not updating when moving notes via editor dropdown',
      'Tag counts not refreshing after adding/removing tags from notes',
      'Folder icons now display in folder selector dropdown',
    ],
  },
  {
    version: '0.30.1',
    date: '2024-11-30',
    fixed: [
      'Folders not loading after v0.30.0 update (missing database migration for icon column)',
    ],
  },
  {
    version: '0.30.0',
    date: '2024-11-30',
    added: [
      'Folder Icons: Customize folder appearance with 27 different icons',
      'What\'s New Modal: Click version number to see release notes and update history',
      'Version Badge: "NEW" indicator shows when app has been updated',
    ],
    fixed: [
      'Folder sidebar layout improvements for narrow widths',
      'Edit mode button overflow in sidebar items',
    ],
  },
  {
    version: '0.29.1',
    date: '2024-11-29',
    fixed: [
      'TipTap editor scroll issue with absolute positioning',
      'Focus visibility improvements for accessibility',
    ],
  },
  {
    version: '0.29.0',
    date: '2024-11-28',
    added: [
      'Task Management System: Full todo/task support with note integration',
      'Task import from existing notes with automatic parsing',
      'Task scanning to detect actionable items in notes',
    ],
    fixed: [
      'API type mismatches between scan and import endpoints',
      'TypeScript build errors with Set type inference',
    ],
  },
  {
    version: '0.28.3',
    date: '2024-11-27',
    added: [
      'Tiptap rich text editor with comprehensive markdown support',
      'Note organization improvements with drag-and-drop',
    ],
    fixed: [
      'Mobile bottom navigation visibility',
      'Mobile responsiveness for large devices (Pixel Fold)',
      'Drag-and-drop security improvements',
      'Note editor layout issues',
    ],
  },
  {
    version: '0.28.2',
    date: '2024-11-26',
    fixed: [
      'Docker build now correctly injects version from package.json',
      'Version display in UI shows correct build version',
    ],
  },
  {
    version: '0.28.1',
    date: '2024-11-25',
    added: [
      'Trash/soft delete system for notes',
      'Unfiled notes indicator in sidebar',
    ],
    fixed: [
      'Critical production authentication issues',
      'Cookie handling behind reverse proxy (Cloudflare Tunnel)',
    ],
  },
  {
    version: '0.28.0',
    date: '2024-11-24',
    added: [
      'AI-powered tag suggestions that prefer existing tags',
      'Improved tag suggestion scalability (limited to 50 most recent)',
    ],
    fixed: [
      'Frontend data refresh issues',
      'API base URL for production deployment',
      'Prisma migrations included in version control',
    ],
  },
  {
    version: '0.27.0',
    date: '2024-11-23',
    added: [
      'Initial public release',
      'Note creation and editing with markdown support',
      'Folder organization system',
      'Tag management',
      'AI-powered features (summarization, tag suggestions)',
      'Dark mode support',
      'Docker deployment support',
      'Multi-user authentication',
    ],
  },
];

export function getCurrentVersion(): string {
  return changelog[0]?.version || '0.0.0';
}

export function getLatestChangelog(): ChangelogEntry | undefined {
  return changelog[0];
}

# Notez MVP Specification

## Version 1.0 - Minimum Viable Product

**Goal:** Get a functional, self-hosted note-taking application deployed to your server within a reasonable timeframe that you can actually use daily.

## Philosophy

The MVP focuses on **core functionality that works well** rather than comprehensive features that are half-baked. We can iterate and add advanced features once the foundation is solid.

**MVP Mantra:** "I can log in, write notes, organize them, search them, and have basic AI help me."

## Technology Stack (Final Decision)

### Backend
- **Runtime:** Node.js 24 LTS (historical: this v1.0 spec was written for Node.js 20, now end of life)
- **Framework:** Fastify (faster than Express, better TypeScript support)
- **Language:** TypeScript
- **Database:** PostgreSQL 16 with pgvector extension
- **ORM:** Prisma (excellent TypeScript integration, migrations)
- **Authentication:** JWT with jose library

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite (fast dev experience)
- **UI Library:** shadcn/ui (modern, customizable, accessible)
- **Editor:** Monaco Editor (VS Code's editor - familiar and powerful)
- **State:** Zustand (simple, no boilerplate)
- **API Client:** TanStack Query (caching, optimistic updates)
- **Routing:** React Router v6

### DevOps
- **Container:** Docker with multi-stage builds
- **Registry:** ghcr.io
- **CI/CD:** GitHub Actions
- **Database in Container:** PostgreSQL official image

**Why these choices?**
- TypeScript everywhere = better DX, fewer bugs
- Fastify = performance without complexity
- Prisma = type-safe database access, easy migrations
- Monaco = professional editor experience out of the box
- shadcn/ui = modern UI without framework lock-in

## MVP Feature Set

### ✅ IN SCOPE - Must Have

#### 1. Authentication & Users
- [ ] First-boot setup screen (create admin account)
- [ ] Login page with username/password
- [ ] JWT token authentication (access + refresh tokens)
- [ ] Basic session management
- [ ] Admin can create new users (username, email, temp password)
- [ ] Admin can list and deactivate users
- [ ] Users forced to change password on first login
- [ ] Simple password requirements (min 8 chars, 1 number, 1 uppercase)

**DB Tables:** `users`, `sessions`

#### 2. Note Management (Core)
- [ ] Create/read/update/delete notes
- [ ] Each note has: title, content (plain text/markdown), created/updated timestamps
- [ ] Rich text editor with Monaco (syntax highlighting for code blocks)
- [ ] Auto-save every 30 seconds (with visual indicator)
- [ ] Manual save with Ctrl+S
- [ ] Note list view (sorted by updated date)
- [ ] Open note in editor from list

**DB Tables:** `notes`

#### 3. Basic Organization
- [ ] Create/rename/delete folders (single level - flat structure for MVP)
- [ ] Assign notes to folders
- [ ] Move notes between folders (drag-and-drop is nice-to-have)
- [ ] Folder tree sidebar
- [ ] "All Notes" view (shows all notes regardless of folder)
- [ ] "Unfiled" notes (notes not in any folder)

**DB Tables:** `folders`, update `notes` with `folder_id`

#### 4. Search (Basic)
- [ ] Search notes by title and content (full-text search)
- [ ] Case-insensitive search
- [ ] Search results show note title, folder, and snippet with highlight
- [ ] Click result to open note
- [ ] Search across all folders

**Implementation:** PostgreSQL full-text search (tsvector)

#### 5. Tags
- [ ] Add/remove tags to notes (comma-separated input or multi-select)
- [ ] Tag list in sidebar
- [ ] Click tag to filter notes by tag
- [ ] Tag autocomplete when typing
- [ ] Notes can have multiple tags

**DB Tables:** `tags`, `note_tags` (junction table)

#### 6. AI Integration (Basic)
- [ ] Admin settings page to configure ONE AI provider at a time
- [ ] Support Anthropic Claude, OpenAI, Google Gemini
- [ ] Store API key encrypted (using simple encryption at rest)
- [ ] Test API key connection on save
- [ ] **AI Feature 1:** Summarize note (button in editor)
- [ ] **AI Feature 2:** Suggest title from content
- [ ] **AI Feature 3:** Extract tags from content
- [ ] Show loading state during AI operations
- [ ] Error handling if API fails

**DB Tables:** `system_settings` (key-value store)

**Note:** NO auto-indexing or semantic search in MVP - that's Phase 2. Just direct API calls for specific actions.

#### 7. User Interface
- [ ] Responsive layout (desktop-first, but mobile-friendly)
- [ ] Sidebar with folders, tags, and navigation
- [ ] Main editor area
- [ ] Top navbar with user menu, search bar
- [ ] Dark mode + Light mode toggle
- [ ] Clean, modern design (shadcn/ui default theme)

#### 8. Admin Panel (Minimal)
- [ ] User management page (list, create, deactivate)
- [ ] AI settings page (configure provider and API key)
- [ ] Basic system info (version, database status)

#### 9. Docker & Deployment
- [ ] Single Dockerfile with multi-stage build
- [ ] Docker Compose for local development (app + postgres)
- [ ] Environment variables for all configuration
- [ ] Health check endpoint (`/health`)
- [ ] GitHub Actions workflow:
  - Run tests
  - Build Docker image
  - Push to ghcr.io with tags (commit SHA, `latest`)
  - Optional: Trigger Portainer webhook
- [ ] README with deployment instructions

### ❌ OUT OF SCOPE - Phase 2+

**Explicitly NOT in MVP:**

- ❌ Note linking ([[Note Title]] syntax) - Phase 2
- ❌ Graph visualization - Phase 2
- ❌ Backlinks - Phase 2
- ❌ Version history - Phase 2
- ❌ Note sharing/collaboration - Phase 3
- ❌ Multi-tab editor - Phase 2
- ❌ Split view - Phase 2
- ❌ Daily notes - Phase 2
- ❌ Templates - Phase 2
- ❌ Import/export - Phase 2 (except basic export)
- ❌ Auto-indexing/embeddings - Phase 2
- ❌ Semantic search - Phase 2
- ❌ AI auto-grouping - Phase 2
- ❌ Multi-cursor editing - Nice to have, not essential
- ❌ Advanced find/replace - Phase 2
- ❌ Nested folders (unlimited depth) - Phase 2 (start with single level)
- ❌ Note attachments/uploads - Phase 3
- ❌ Real-time collaboration - Phase 3+
- ❌ Mobile native apps - Future consideration
- ❌ Plugin system - Future consideration

### 🤔 MAYBE - Quick Wins If Time Permits

These are easy adds that provide value:

- Basic note export (export single note as .md or .txt file)
- Note trash/soft delete (instead of permanent delete)
- Keyboard shortcuts (Ctrl+N for new note, Ctrl+F for search)
- Recent notes list
- Note word count in editor
- Note duplication (clone note)

## Database Schema (MVP)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user', -- 'admin' or 'user'
  is_active BOOLEAN DEFAULT true,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions (for refresh tokens)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  refresh_token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Folders
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  content_searchable TSVECTOR, -- For full-text search
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for full-text search
CREATE INDEX notes_content_search_idx ON notes USING GIN(content_searchable);

-- Tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Note-Tag junction
CREATE TABLE note_tags (
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- System settings (key-value store)
CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  encrypted BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Trigger to update content_searchable
CREATE OR REPLACE FUNCTION update_note_searchable()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_searchable := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_searchable
BEFORE INSERT OR UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION update_note_searchable();
```

## API Endpoints (MVP)

### Authentication
- `POST /api/auth/setup` - Initial admin setup (only works if no users exist)
- `POST /api/auth/login` - Login (returns access + refresh tokens)
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (invalidate refresh token)
- `POST /api/auth/change-password` - Change own password

### Users (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PATCH /api/users/:id` - Update user (deactivate, reset password)
- `DELETE /api/users/:id` - Delete user (soft delete)

### Notes
- `GET /api/notes` - List all notes (with filters: folder, tag, search)
- `GET /api/notes/:id` - Get single note
- `POST /api/notes` - Create note
- `PATCH /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### Folders
- `GET /api/folders` - List all folders
- `POST /api/folders` - Create folder
- `PATCH /api/folders/:id` - Rename folder
- `DELETE /api/folders/:id` - Delete folder

### Tags
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `DELETE /api/tags/:id` - Delete tag
- `POST /api/notes/:id/tags` - Add tags to note
- `DELETE /api/notes/:id/tags/:tagId` - Remove tag from note

### Search
- `GET /api/search?q=query` - Search notes (returns matches)

### AI
- `POST /api/ai/summarize` - Summarize note content
- `POST /api/ai/suggest-title` - Suggest title from content
- `POST /api/ai/suggest-tags` - Suggest tags from content

### Admin/System
- `GET /api/admin/settings` - Get system settings
- `PUT /api/admin/settings` - Update system settings (AI config)
- `GET /api/health` - Health check

## UI/UX Flow

### First Run Experience
1. User visits `notez.example.com`
2. System detects no users exist
3. Shows "Welcome to Notez - Setup" page
4. User creates admin account (username, email, password)
5. Redirects to dashboard

### Normal Login Flow
1. User visits site → sees login page
2. Enters username/password
3. If must_change_password → forced to change password screen
4. Redirects to dashboard

### Main Dashboard Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Notez  [Search...]                    [User Menu] [Theme]  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│  Folders     │  Editor: [Note Title]                        │
│  📁 All      │  ┌────────────────────────────────────────┐  │
│  📁 Work     │  │                                        │  │
│  📁 Personal │  │  Monaco Editor                         │  │
│              │  │  Content here...                       │  │
│  Tags        │  │                                        │  │
│  #ideas      │  │                                        │  │
│  #code       │  └────────────────────────────────────────┘  │
│              │  [Save] [AI Summarize] [Suggest Title]       │
│  [+ New]     │  [Suggest Tags]                              │
│              │                                               │
│              │  Tags: [tag1] [tag2] [+]                     │
│              │  Folder: [Personal ▾]                        │
└──────────────┴──────────────────────────────────────────────┘
```

### Admin Panel (Separate Page)
- Tab 1: User Management (list, create, deactivate)
- Tab 2: AI Settings (provider selection, API key, test connection)
- Tab 3: System Info (version, status)

## Development Plan

### Phase 1: Foundation (Week 1-2)
1. Set up project structure (monorepo or separate repos?)
2. Initialize database with Prisma schema
3. Implement authentication (JWT, login, setup flow)
4. Create basic API endpoints (notes CRUD)
5. Set up Docker + Docker Compose for local dev

### Phase 2: Core Features (Week 2-3)
6. Build folder management
7. Build tag system
8. Implement full-text search
9. Create basic UI layout with shadcn/ui
10. Integrate Monaco editor

### Phase 3: AI Integration (Week 3-4)
11. Add AI provider abstraction layer
12. Implement AI settings page
13. Build AI features (summarize, suggest title, suggest tags)
14. Error handling and loading states

### Phase 4: Polish & Deploy (Week 4-5)
15. Add dark mode
16. Admin panel UI
17. User management UI
18. Testing (unit + integration)
19. GitHub Actions CI/CD pipeline
20. Documentation (deployment guide)
21. Deploy to your server!

## Success Criteria

**MVP is complete when:**

✅ You can deploy to your server via Docker
✅ You can create admin account on first boot
✅ You can log in as admin or regular user
✅ You can create, edit, delete notes with auto-save
✅ You can organize notes in folders
✅ You can tag notes
✅ You can search notes and find what you need
✅ You can use AI to summarize, suggest titles, and suggest tags
✅ You can create new users as admin
✅ The app is secure (JWT, encrypted secrets, HTTPS via Cloudflare)
✅ CI/CD pipeline builds and pushes to ghcr.io

**What "good enough" looks like:**
- Basic but functional UI (doesn't need to be perfect)
- Works reliably for daily note-taking
- AI features save you time
- Easy to deploy and maintain

## Technical Decisions

### Monorepo vs Separate Repos?
**Recommendation:** Monorepo (single repo, separate folders)
- Easier to manage for solo developer
- Shared TypeScript types between frontend/backend
- Simpler CI/CD
- Structure: `/backend`, `/frontend`, `/docker`

### Session Management
- Access token: 1 hour expiry (stored in memory/state)
- Refresh token: 7 days (stored in httpOnly cookie)
- Refresh endpoint automatically called when access token expires

### AI Provider Abstraction
```typescript
interface AIProvider {
  summarize(text: string): Promise<string>;
  generateTitle(content: string): Promise<string>;
  suggestTags(content: string): Promise<string[]>;
}

class AnthropicProvider implements AIProvider { ... }
class OpenAIProvider implements AIProvider { ... }
class GeminiProvider implements AIProvider { ... }
```

### Error Handling
- API returns consistent error format: `{ error: string, code: string }`
- Frontend shows toast notifications for errors
- Graceful degradation (if AI fails, app still works)

### Testing Strategy (Pragmatic)
- Unit tests for critical business logic (auth, search)
- Integration tests for API endpoints
- E2E tests for happy paths (login, create note, search)
- Aim for 60-70% coverage (not 100% - be pragmatic)

## Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
BASE_URL=https://notez.example.com
FRONTEND_URL=https://notez.example.com

# Database
DATABASE_URL=postgresql://notez:password@postgres:5432/notez

# Security
JWT_ACCESS_SECRET=<random-64-char-string>
JWT_REFRESH_SECRET=<random-64-char-string>
ENCRYPTION_KEY=<random-32-char-string>

# CORS
CORS_ORIGIN=https://notez.example.com

# Optional: AI keys configured via UI, but can be set here
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# GEMINI_API_KEY=
```

## Open Questions for MVP

1. **Monorepo structure:** Should we use Turborepo/Nx or just simple folders?
   - **Recommendation:** Simple folders for MVP, can refactor later

2. **Database migrations:** Auto-run on startup or manual?
   - **Recommendation:** Auto-run on startup (Prisma handles this well)

3. **Note content format:** Store as plain text or enforce markdown?
   - **Recommendation:** Store as plain text, let users write markdown if they want

4. **Auto-save conflicts:** What if user has note open in multiple tabs?
   - **MVP Solution:** Last write wins (Phase 2 can add conflict detection)

5. **AI timeout:** How long to wait for AI response?
   - **Recommendation:** 30 second timeout with loading indicator

6. **Default folder:** Should there be a default "General" folder?
   - **Recommendation:** Yes, auto-created on first login

## Next Steps

1. **Review this MVP spec** - Does this feel right? Too much? Too little?
2. **Make final tech decisions** - Agree on the stack
3. **Create project structure** - Set up repo, initialize projects
4. **Define database schema** - Create Prisma schema file
5. **Start coding!** - Begin with auth system

---

**What do you think?** Is this the right scope for MVP? Should we add/remove anything?
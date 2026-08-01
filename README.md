# Notez

A self-hosted, web-based note-taking application with real-time collaboration, task management, AI features, and MCP integration.

## Features

- **Real-Time Collaboration** -- Share notes with other users and edit together with live cursors (Yjs CRDT)
- **Rich Text Editor** -- TipTap-based editor with markdown support, image uploads, and inline resizing
- **Task Management** -- Tasks with priorities, due dates, hyperlinks, and a Kanban board view
- **AI Integration** -- Summarize notes, suggest titles, extract tags (Claude, GPT, Gemini)
- **MCP Server** -- Claude Code can read and manage notes/tasks via the Model Context Protocol
- **Folders & Tags** -- Organize notes with customizable folder icons and multi-tag support
- **Full-Text Search** -- PostgreSQL-powered search with snippets and relevance ranking
- **Note Sharing** -- Granular VIEW/EDIT permissions with in-app notifications
- **User Management** -- Admin panel, service accounts, role-based access control
- **Dark Mode** -- Light/dark theme with system preference detection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify, TypeScript, Prisma, PostgreSQL |
| Frontend | React 19, Vite, TipTap, Tailwind CSS |
| Collaboration | Yjs, Hocuspocus |
| Storage | MinIO (S3-compatible) |
| MCP | `notez-mcp` (npm package) |
| Deployment | Docker, GitHub Actions |

## Quick Start

### Docker Compose

```bash
git clone https://github.com/cogghaus/notez.git
cd notez

# Edit compose.prod.yml and set environment variables
# Required: POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
#           ENCRYPTION_KEY, MINIO_SECRET_KEY, CORS_ORIGIN, APP_URL

docker compose -f compose.prod.yml up -d
```

Visit your configured URL. On first access, you'll create an admin account through the setup wizard.

### Local Development

```bash
# Backend
cd backend
npm install
cp .env.example .env   # Edit with your credentials
npx prisma migrate dev
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## MCP Integration

Notez includes an MCP server that lets Claude Code interact with your notes and tasks.

```bash
# Install globally
npm install -g notez-mcp

# Or run directly
npx notez-mcp
```

See [`notez-mcp/README.md`](./notez-mcp/README.md) for setup instructions and available tools.

## Environment Variables

**Required:**
- `DATABASE_URL` -- PostgreSQL connection string
- `JWT_ACCESS_SECRET` -- JWT access token secret
- `JWT_REFRESH_SECRET` -- JWT refresh token secret
- `ENCRYPTION_KEY` -- AES-256 encryption key (32+ characters)
- `MINIO_SECRET_KEY` -- MinIO/S3 secret key

**Required in production:**
- `CORS_ORIGIN` -- Allowed CORS origin
- `APP_URL` -- Public URL of the application

**Optional:**
- `COOKIE_SECRET` -- Cookie signing secret (defaults to JWT_REFRESH_SECRET)
- `RESEND_API_KEY` -- For password reset emails

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.

## License

[MIT](./LICENSE)

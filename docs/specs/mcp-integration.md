# MCP Integration Architecture

**Authors:** Winston (Architect), Amelia (Developer)
**Created:** 2025-12-03
**Status:** Draft
**Issue:** #87

---

## Executive Summary

This document specifies the architecture for integrating Notez with AI assistants via the Model Context Protocol (MCP). The integration enables bidirectional data flow:

- **Inbound (AI → Notez):** Save conversations, create notes, append content
- **Outbound (Notez → AI):** Search notes, retrieve content, query knowledge base

### Vision Statement

> Notez becomes a persistent memory layer for AI assistants—a self-hosted, private knowledge base that AI can read from and write to, creating a personal "second brain" that grows through both human input and AI-assisted capture.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP Integration Architecture                       │
│                                                                             │
│  ┌─────────────┐    ┌─────────────────────────────────────────────────────┐│
│  │   Claude    │    │                    Notez Backend                     ││
│  │   Desktop   │    │                                                     ││
│  │      or     │    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ ││
│  │   ChatGPT   │    │  │   MCP API   │  │   Token     │  │   Rate      │ ││
│  │             │    │  │   Routes    │──│   Validator │──│   Limiter   │ ││
│  └──────┬──────┘    │  │ /api/mcp/*  │  │             │  │  (separate) │ ││
│         │           │  └──────┬──────┘  └─────────────┘  └─────────────┘ ││
│         │           │         │                                          ││
│         ▼           │         ▼                                          ││
│  ┌─────────────┐    │  ┌─────────────┐  ┌─────────────┐                  ││
│  │  notez-mcp  │────│──│   Service   │──│   Prisma    │──────────────────┼┼──▶ PostgreSQL
│  │   package   │    │  │   Layer     │  │   Client    │                  ││
│  │             │    │  └─────────────┘  └─────────────┘                  ││
│  └─────────────┘    │                                                     ││
│                     └─────────────────────────────────────────────────────┘│
│         │                                                                   │
│         │ MCP Protocol (JSON-RPC over stdio/SSE)                           │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │                        MCP Tool Interface                                │
│  │                                                                         │
│  │  notez_search_notes    notez_get_note    notez_create_note             │
│  │  notez_append_to_note  notez_list_recent notez_list_folders            │
│  └─────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Model

### API Token Design

Unlike user sessions (JWT with refresh tokens), MCP uses long-lived API tokens with explicit scopes.

#### Token Format

```
ntez_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     │                                  │
     └── Prefix (4 chars)               └── Random (32 chars, base62)
```

- **Prefix:** `ntez_` for easy identification
- **Body:** 32 cryptographically random characters
- **Storage:** Only the hash is stored; full token shown once at creation

#### Database Schema

```prisma
model ApiToken {
  id          String    @id @default(cuid())
  userId      String
  name        String    // User-friendly name: "Claude Desktop", "ChatGPT"
  tokenHash   String    @unique
  prefix      String    // "ntez_xxxx" for display/identification
  scopes      String[]  // ["read"], ["write"], or ["read", "write"]
  lastUsedAt  DateTime?
  expiresAt   DateTime? // null = never expires
  createdAt   DateTime  @default(now())
  revokedAt   DateTime? // Soft revoke

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId])
}
```

#### Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      Token Lifecycle                             │
│                                                                 │
│  1. CREATE                                                      │
│     ├── User clicks "Generate API Token" in Settings            │
│     ├── Backend generates cryptographic random token            │
│     ├── Hash stored in database                                 │
│     └── Full token displayed ONCE (copy to clipboard)           │
│                                                                 │
│  2. USE                                                         │
│     ├── AI sends: Authorization: Bearer ntez_xxx...             │
│     ├── Backend hashes received token                           │
│     ├── Compares against stored hash                            │
│     ├── Validates scopes for requested operation                │
│     └── Updates lastUsedAt                                      │
│                                                                 │
│  3. REVOKE                                                      │
│     ├── User clicks "Revoke" in Settings                        │
│     ├── Backend sets revokedAt timestamp                        │
│     └── Future requests with this token fail                    │
│                                                                 │
│  4. EXPIRE (optional)                                           │
│     ├── If expiresAt is set and past                            │
│     └── Token automatically invalid                             │
└─────────────────────────────────────────────────────────────────┘
```

### Security Considerations

| Concern | Mitigation |
|---------|------------|
| Token theft | Tokens are hashed (bcrypt), not stored in plain text |
| Scope creep | Explicit scopes (`read`, `write`) enforced per endpoint |
| Brute force | Separate rate limiter for API tokens (stricter) |
| Long-lived risk | Optional expiration, easy revocation |
| Audit trail | `lastUsedAt` updated on each use |

---

## API Endpoints

### Token Management (User-Facing)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tokens` | JWT | List user's API tokens (masked) |
| POST | `/api/tokens` | JWT | Create new API token |
| DELETE | `/api/tokens/:id` | JWT | Revoke API token |

#### Create Token Request/Response

```typescript
// POST /api/tokens
// Request
{
  "name": "Claude Desktop",
  "scopes": ["read", "write"],
  "expiresIn": null  // or "30d", "90d", "1y"
}

// Response (token shown only once!)
{
  "id": "clxyz123...",
  "name": "Claude Desktop",
  "token": "ntez_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",  // ONLY TIME THIS IS SHOWN
  "prefix": "ntez_a1b2",
  "scopes": ["read", "write"],
  "expiresAt": null,
  "createdAt": "2025-12-03T..."
}
```

### MCP Tool Endpoints

All MCP endpoints require `Authorization: Bearer ntez_xxx...` header.

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/mcp/notes/search` | read | Full-text search notes |
| GET | `/api/mcp/notes/:id` | read | Get note by ID |
| GET | `/api/mcp/notes/by-title` | read | Get note by exact title |
| GET | `/api/mcp/notes/recent` | read | List recent notes |
| GET | `/api/mcp/folders` | read | List folders |
| POST | `/api/mcp/notes` | write | Create new note |
| PATCH | `/api/mcp/notes/:id/append` | write | Append to existing note |
| GET | `/api/mcp/tasks` | read | List tasks (status list, sync identity, parent, sort, paging) |
| GET | `/api/mcp/tasks/by-external-id` | read | Get a task by `source` + `externalId` (1.31.0) |
| GET | `/api/mcp/tasks/:id` | read | Get task with parent and subtasks |
| POST | `/api/mcp/tasks` | write | Create task (409 on a duplicate sync identity) |
| PATCH | `/api/mcp/tasks/:id` | write | Update task (not the sync identity) |
| PATCH | `/api/mcp/tasks/:id/status` | write | Update status |
| DELETE | `/api/mcp/tasks/:id` | write | Delete task |

This table predates the full surface; `docs/api-reference.md` > External API (v1) is the complete, current list. `/api/v1` and `/api/mcp` serve the same routes.

#### Endpoint Specifications

##### Search Notes

```typescript
// GET /api/mcp/notes/search?q=kitchen+renovation&limit=10

// Response
{
  "query": "kitchen renovation",
  "results": [
    {
      "id": "note_abc123",
      "title": "Kitchen Renovation Plans",
      "snippet": "...cabinet delivery delayed until January...",
      "updatedAt": "2025-12-01T...",
      "folder": { "id": "folder_xyz", "name": "Home Projects" },
      "tags": ["home", "renovation"]
    }
  ],
  "total": 3
}
```

##### Get Note

```typescript
// GET /api/mcp/notes/note_abc123

// Response
{
  "id": "note_abc123",
  "title": "Kitchen Renovation Plans",
  "content": "<p>Full HTML content here...</p>",
  "plainText": "Plain text version for AI processing...",
  "folder": { "id": "folder_xyz", "name": "Home Projects" },
  "tags": ["home", "renovation"],
  "createdAt": "2025-11-15T...",
  "updatedAt": "2025-12-01T..."
}
```

##### Get Note by Title

```typescript
// GET /api/mcp/notes/by-title?title=Kitchen%20Renovation%20Plans

// Response: Same as Get Note
```

##### Create Note

```typescript
// POST /api/mcp/notes
// Request
{
  "title": "Conversation: Project Planning",
  "content": "<h2>Summary</h2><p>Discussed timeline...</p>",
  "folderId": "folder_xyz",  // optional
  "tags": ["ai-generated", "meeting"]  // optional
}

// Response
{
  "id": "note_new123",
  "title": "Conversation: Project Planning",
  "createdAt": "2025-12-03T..."
}
```

##### Append to Note

```typescript
// PATCH /api/mcp/notes/note_abc123/append
// Request
{
  "content": "\n\n## Update (2025-12-03)\n\nNew information here...",
  "separator": "\n\n---\n\n"  // optional, default is double newline
}

// Response
{
  "id": "note_abc123",
  "updatedAt": "2025-12-03T..."
}
```

##### List Recent Notes

```typescript
// GET /api/mcp/notes/recent?limit=10

// Response
{
  "notes": [
    {
      "id": "note_abc123",
      "title": "Kitchen Renovation Plans",
      "snippet": "First 200 chars...",
      "updatedAt": "2025-12-01T..."
    }
  ]
}
```

##### Tasks: WAITING, sync identity, start date, subtasks (1.31.0)

Added for Foyer (Foyer ADR 0002), which files tasks into Notez through an agent token on the owner's account.

- **Statuses:** `PENDING`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `CANCELLED`, from one `TASK_STATUSES` constant (`backend/src/utils/validation.schemas.ts`) used by the session API, the external API and the remote MCP tools. `notez-mcp` mirrors it in `src/types.ts`. `waitingOn` (255) names who or what a waiting task waits on.
- **Sync identity:** `source` (`^[a-z][a-z0-9_-]{1,49}$`) + `externalId` (1..255), both or neither, set at creation and never updated, unique per user. A duplicate create answers `409`; the client resolves it with `GET /tasks/by-external-id`. This makes a retried create idempotent without an idempotency table.
- **`startDate`:** do not start before; not after `dueDate` when both are sent; `sortBy=startDate`.
- **Subtasks:** `parentTaskId`, one level deep, rows locked during the check; deleting a parent frees its subtasks (SET NULL).
- **List:** `status` takes a comma list (`PENDING,IN_PROGRESS,WAITING`); `limit` up to 100 with `offset`.
- **Version gate:** `GET /health` returns `version`. Older servers strip unknown body fields silently (non-strict zod), so a client must check `version >= 1.31.0` before relying on `externalId`.

```typescript
// POST /api/v1/tasks
{
  "title": "Call the notary",
  "status": "PENDING",
  "dueDate": "2026-10-21T00:00:00.000Z",
  "noteId": "memo-note-uuid",
  "links": [{ "url": "https://foyer.example/captures/c1#proposal-p1", "title": "Open in Foyer" }],
  "source": "foyer",
  "externalId": "p1"
}
// 201: the task. Same body again: 409 { "error": "ConflictError", "message": "A task with this source and externalId already exists" }

// GET /api/v1/tasks/by-external-id?source=foyer&externalId=p1  -> 200 task | 404
```

MCP tools (`backend/src/mcp/tools.ts` and `notez-mcp` 1.14.0): `notez_create_task` takes `status`, `noteId`, `links`, `waitingOn`, `startDate`, `parentTaskId`, `source`, `externalId`; `notez_update_task` the same minus `source` and `externalId`; `notez_list_tasks` filters by `status` (WAITING included), `source`, `externalId` and `parentTaskId`. The remote tools run their arguments through the shared schemas, so the cross-field rules hold there too.

---

## MCP Server Package

### Package Structure

```
notez-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # MCP server implementation
│   ├── tools/
│   │   ├── search.ts
│   │   ├── get-note.ts
│   │   ├── create-note.ts
│   │   ├── append-note.ts
│   │   └── list-recent.ts
│   ├── client.ts         # Notez API client
│   └── types.ts
└── README.md
```

### Configuration

```json
// Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "notez": {
      "command": "npx",
      "args": ["notez-mcp"],
      "env": {
        "NOTEZ_URL": "http://localhost:3000",
        "NOTEZ_API_TOKEN": "ntez_xxx..."
      }
    }
  }
}
```

### Tool Definitions

```typescript
// src/tools.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'notez_search_notes',
    description: 'Search your notes by keyword or phrase. Returns matching notes with titles, snippets, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords, phrases, or questions)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50)',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'notez_get_note',
    description: 'Retrieve the full content of a specific note by its ID or exact title.',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: {
          type: 'string',
          description: 'The unique ID of the note'
        },
        title: {
          type: 'string',
          description: 'The exact title of the note (case-insensitive)'
        }
      },
      oneOf: [
        { required: ['noteId'] },
        { required: ['title'] }
      ]
    }
  },
  {
    name: 'notez_create_note',
    description: 'Create a new note in Notez. Use this to save conversation summaries, insights, or any information worth remembering.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title for the new note'
        },
        content: {
          type: 'string',
          description: 'Content of the note (supports markdown)'
        },
        folder: {
          type: 'string',
          description: 'Folder name to place the note in (created if doesn\'t exist)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to apply to the note'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'notez_append_to_note',
    description: 'Append content to an existing note. Useful for adding updates, action items, or additional information.',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: {
          type: 'string',
          description: 'The unique ID of the note'
        },
        title: {
          type: 'string',
          description: 'The exact title of the note'
        },
        content: {
          type: 'string',
          description: 'Content to append (supports markdown)'
        }
      },
      required: ['content'],
      oneOf: [
        { required: ['noteId'] },
        { required: ['title'] }
      ]
    }
  },
  {
    name: 'notez_list_recent',
    description: 'List recently modified notes. Useful for getting context on what the user has been working on.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of notes to return (default: 10, max: 50)',
          default: 10
        }
      }
    }
  },
  {
    name: 'notez_list_folders',
    description: 'List all folders in the user\'s Notez workspace.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];
```

---

## Rate Limiting

### Separate Limits for API Tokens

```typescript
// backend/src/plugins/rate-limit.ts

// User session rate limits (existing)
const sessionLimits = {
  login: { max: 5, window: '15m' },
  api: { max: 100, window: '1m' }
};

// API token rate limits (more restrictive)
const tokenLimits = {
  read: { max: 60, window: '1m' },   // 1 req/sec average
  write: { max: 20, window: '1m' },  // Prevent spam creation
  search: { max: 30, window: '1m' }  // Search is heavier
};
```

### Rate Limit Headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1701619200
```

---

## Error Handling

### Standard Error Responses

```typescript
// 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Invalid or expired API token"
}

// 403 Forbidden
{
  "error": "forbidden",
  "message": "Token does not have 'write' scope"
}

// 404 Not Found
{
  "error": "not_found",
  "message": "Note not found"
}

// 429 Too Many Requests
{
  "error": "rate_limited",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. Create `ApiToken` Prisma model
2. Implement token generation in backend
3. Build token management UI in Settings
4. Implement token validation middleware

### Phase 2: Core Tools (Week 2)

1. Create `/api/mcp/*` routes
2. Implement `search`, `get`, `create`, `append`, `list` handlers
3. Add separate rate limiting
4. Write integration tests

### Phase 3: MCP Package (Week 3)

1. Initialize `notez-mcp` package
2. Implement MCP server with SDK
3. Connect tools to Notez API client
4. Test with Claude Desktop

### Phase 4: Polish (Week 4)

1. Error handling improvements
2. Documentation for users
3. Claude Desktop configuration guide
4. Publish to npm

---

## Future Enhancements

### Phase 3 Integration (Semantic Search)

When pgvector embeddings are implemented:

```typescript
// New tool
{
  name: 'notez_semantic_search',
  description: 'Find notes by meaning, not just keywords. Ask questions like "what did I write about improving productivity?"',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or question'
      },
      limit: { type: 'number', default: 10 }
    },
    required: ['query']
  }
}

// New tool
{
  name: 'notez_find_related',
  description: 'Find notes similar to a given note',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string' },
      limit: { type: 'number', default: 5 }
    },
    required: ['noteId']
  }
}
```

### Backlinks Integration

When wiki-links are implemented, search results can include:

```typescript
{
  "id": "note_abc123",
  "title": "Project Phoenix",
  "backlinks": 15,  // Number of notes linking to this
  "linkedNotes": ["note_xyz", "note_456"]  // Notes this links to
}
```

---

## Security Checklist

- [ ] Tokens hashed with bcrypt before storage
- [ ] Full token displayed only once at creation
- [ ] Scopes enforced on every MCP endpoint
- [ ] Rate limiting separate from user sessions
- [ ] Token revocation immediate (no cache)
- [ ] Audit log of token usage (lastUsedAt)
- [ ] No sensitive data in error messages
- [ ] HTTPS required in production

---

## User Documentation Outline

### Setting Up Notez MCP

1. **Generate API Token**
   - Go to Settings → API Tokens
   - Click "Generate New Token"
   - Name it (e.g., "Claude Desktop")
   - Select scopes (Read + Write recommended)
   - Copy token (shown once!)

2. **Configure Claude Desktop**
   - Open Claude Desktop settings
   - Add MCP server configuration
   - Paste token and Notez URL

3. **Test It Out**
   - Ask Claude: "What's in my notes about [topic]?"
   - Ask Claude: "Save this conversation to Notez"

### Example Prompts

- "Search my notes for [keyword]"
- "What did I write about [topic]?"
- "Create a note about our discussion on [subject]"
- "Add these action items to my [project] note"
- "What have I been working on recently?"

---

*Architecture designed by Winston (Architect) and Amelia (Developer), 2025-12-03*

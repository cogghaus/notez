# notez-mcp

MCP (Model Context Protocol) server for [Notez](https://github.com/cogghaus/notez) — a self-hosted note-taking app. Allows Claude Code and other MCP-compatible clients to read and manage your notes and tasks.

## Prerequisites

- A running Notez instance (v1.6.0+)
- An API token (create one in **Settings > API Tokens**, or via `curl`)

## Quick Start

### With npx (no install required)

```bash
npx notez-mcp
```

### Global install

```bash
npm install -g notez-mcp
notez-mcp
```

## Claude Code Configuration

Add the following to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "notez": {
      "command": "npx",
      "args": ["-y", "notez-mcp"],
      "env": {
        "NOTEZ_URL": "https://your-notez-instance.com",
        "NOTEZ_API_TOKEN": "ntez_your_token_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTEZ_URL` | Yes | URL of your Notez instance (e.g., `https://notez.example.com`) |
| `NOTEZ_API_TOKEN` | Yes | API token with appropriate scopes |

## Available Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `notez_search_notes` | read | Search notes by keyword |
| `notez_get_note` | read | Get a note by ID |
| `notez_get_note_by_title` | read | Get a note by exact title |
| `notez_list_recent` | read | List recently updated notes |
| `notez_create_note` | write | Create a new note |
| `notez_append_to_note` | write | Append content to an existing note |
| `notez_list_tasks` | read | List tasks, filtered by status, `source` + `externalId` or `parentTaskId` (limit up to 100) |
| `notez_get_task` | read | Get a task by ID, with its parent and subtasks |
| `notez_create_task` | write | Create a new task (status, dates, waiting-on, note, folder, parent, links, `source` + `externalId`) |
| `notez_update_task` | write | Update a task (everything but `source` and `externalId`; links and tags are replaced) |
| `notez_list_folders` | read | List all folders |

### Task fields (1.14.0, needs Notez 1.31.0 or later)

- **Status** is one of `PENDING`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `CANCELLED`. `waitingOn` says who or what a `WAITING` task waits on; it is free text and is not cleared on a status change.
- **`startDate`** is "do not start before" (ISO 8601). It must not be after `dueDate` when both are sent.
- **`source` + `externalId`** identify a task filed by another system (for example `source: "foyer"`). They are set together at creation, are unique per user, and cannot be changed: a second create with the same pair fails with "already exists", which makes retries safe.
- **`parentTaskId`** makes a task a subtask. Subtasks are one level deep: a subtask cannot have subtasks, and a task with subtasks cannot become one. Deleting a parent keeps its subtasks as top-level tasks.

Against an older Notez the new fields are ignored rather than refused, so check the server version (`GET /health` returns `version` from 1.31.0) before relying on them.

## Creating an API Token

### Via the Settings UI (recommended)

1. Log in to your Notez instance
2. Go to **Settings > API Tokens**
3. Click **New Token**
4. Give it a name (e.g., "Claude Code - Laptop")
5. Select permissions: **Read** and **Write**
6. Choose an expiration period
7. Click **Create Token** and copy the token immediately — it won't be shown again

### Via curl

```bash
# Log in to get a JWT
TOKEN=$(curl -s -X POST https://your-notez-instance.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"your-username","password":"your-password"}' \
  | jq -r '.accessToken')

# Create an API token
curl -s -X POST https://your-notez-instance.com/api/tokens \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Claude Code","scopes":["read","write"],"expiresIn":"90d"}'
```

## License

MIT

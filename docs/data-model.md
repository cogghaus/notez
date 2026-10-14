# Notez Data Model Reference

> Auto-generated from Prisma schema analysis
> Generated: 2025-11-29

## Overview

Notez uses PostgreSQL 16 with Prisma ORM. The schema consists of 10 models organized around user-owned content.

## Entity Relationship Diagram

```
┌──────────────────┐
│      User        │
│──────────────────│
│ id (PK)          │
│ username         │
│ email            │
│ passwordHash     │
│ role             │
│ isActive         │
│ mustChangePassword│
└────────┬─────────┘
         │
    ┌────┴────┬──────────┬──────────┬──────────┬────────────┐
    │         │          │          │          │            │
    ▼         ▼          ▼          ▼          ▼            ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│Session │ │Folder  │ │ Note   │ │  Tag   │ │ Task   │ │UserAISettings│
└────────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └──────────────┘
               │          │          │          │
               │    ┌─────┴─────┐    │    ┌─────┴─────┐
               │    ▼           ▼    │    ▼           ▼
               │ ┌───────┐  ┌───────┐│ ┌───────┐  ┌───────┐
               └►│ Note  │  │NoteTag│◄┘ │TaskTag│  │ Task  │
                 └───────┘  └───────┘   └───────┘  └───────┘
```

## Models

### User

The core account entity. All content is owned by users.

```prisma
model User {
  id                 String    @id @default(uuid())
  username           String    @unique @db.VarChar(50)
  email              String    @unique @db.VarChar(255)
  passwordHash       String    @map("password_hash") @db.VarChar(255)
  role               String    @default("user") @db.VarChar(20)
  isActive           Boolean   @default(true) @map("is_active")
  mustChangePassword Boolean   @default(false) @map("must_change_password")
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  // Relations
  sessions   Session[]
  folders    Folder[]
  notes      Note[]
  tags       Tag[]
  tasks      Task[]
  aiSettings UserAISettings?

  @@map("users")
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| username | VARCHAR(50) | Unique | Login username |
| email | VARCHAR(255) | Unique | Email address |
| passwordHash | VARCHAR(255) | Required | bcrypt hash |
| role | VARCHAR(20) | Default: "user" | "admin" or "user" |
| isActive | Boolean | Default: true | Account status |
| mustChangePassword | Boolean | Default: false | Force password change |
| createdAt | Timestamp | Auto | Creation time |
| updatedAt | Timestamp | Auto | Last update time |

### Session

Manages refresh tokens for JWT authentication.

```prisma
model Session {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  refreshToken String   @unique @map("refresh_token") @db.VarChar(500)
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Session identifier |
| userId | UUID | FK → User | Owner |
| refreshToken | VARCHAR(500) | Unique | JWT refresh token |
| expiresAt | Timestamp | Required | Token expiration (7 days) |
| createdAt | Timestamp | Auto | Creation time |

**Cascade:** Deleting a user deletes all their sessions.

### Folder

Single-level folder organization for notes.

```prisma
model Folder {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String   @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes Note[]
  tasks Task[]

  @@unique([userId, name])
  @@map("folders")
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Folder identifier |
| userId | UUID | FK → User | Owner |
| name | VARCHAR(255) | Unique per user | Folder name |

**Unique Constraint:** `(userId, name)` - Users can't have duplicate folder names.

### Note

Core content entity with full-text search support.

```prisma
model Note {
  id           String                    @id @default(uuid())
  userId       String                    @map("user_id")
  folderId     String?                   @map("folder_id")
  title        String                    @db.VarChar(500)
  content      String?                   @db.Text
  searchVector Unsupported("tsvector")?  @map("search_vector")
  deleted      Boolean                   @default(false)
  deletedAt    DateTime?                 @map("deleted_at")
  createdAt    DateTime                  @default(now()) @map("created_at")
  updatedAt    DateTime                  @updatedAt @map("updated_at")

  user   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  folder Folder?   @relation(fields: [folderId], references: [id], onDelete: SetNull)
  tags   NoteTag[]
  tasks  Task[]

  @@index([searchVector], type: Gin)
  @@map("notes")
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Note identifier |
| userId | UUID | FK → User | Owner |
| folderId | UUID? | FK → Folder (nullable) | Parent folder |
| title | VARCHAR(500) | Required | Note title |
| content | Text | Optional | Markdown/plain text content |
| searchVector | tsvector | GIN indexed | Full-text search vector |
| deleted | Boolean | Default: false | Soft delete flag |
| deletedAt | Timestamp? | Nullable | When moved to trash |

**Full-Text Search:** The `searchVector` column is automatically updated by a PostgreSQL trigger combining title and content.

**Soft Delete:** Notes are not permanently deleted; `deleted=true` moves them to trash.

### Tag

User-scoped tags for categorizing notes and tasks.

```prisma
model Tag {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String   @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  notes     NoteTag[]
  taskTags  TaskTag[]

  @@unique([userId, name])
  @@map("tags")
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Tag identifier |
| userId | UUID | FK → User | Owner |
| name | VARCHAR(100) | Unique per user | Tag name |

### NoteTag (Junction)

Many-to-many relationship between notes and tags.

```prisma
model NoteTag {
  noteId String @map("note_id")
  tagId  String @map("tag_id")

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
  @@map("note_tags")
}
```

### Task

Todo items that can be standalone or linked to notes.

```prisma
model Task {
  id          String      @id @default(uuid())
  userId      String      @map("user_id")
  title       String      @db.VarChar(500)
  description String?     @db.Text
  status      TaskStatus  @default(PENDING)
  priority    Priority    @default(MEDIUM)
  dueDate     DateTime?   @map("due_date")
  noteId      String?     @map("note_id")
  noteTitle   String?     @map("note_title") @db.VarChar(500)
  folderId    String?     @map("folder_id")
  createdByTokenId String? @map("created_by_token_id")
  waitingOn   String?     @map("waiting_on") @db.VarChar(255)
  source      String?     @db.VarChar(50)
  externalId  String?     @map("external_id") @db.VarChar(255)
  startDate   DateTime?   @map("start_date")
  parentTaskId String?    @map("parent_task_id")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")
  completedAt DateTime?   @map("completed_at")

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  note           Note?     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  folder         Folder?   @relation(fields: [folderId], references: [id], onDelete: SetNull)
  createdByToken ApiToken? @relation("taskCreatedByToken", fields: [createdByTokenId], references: [id], onDelete: SetNull)
  parent         Task?     @relation("TaskSubtasks", fields: [parentTaskId], references: [id], onDelete: SetNull)
  subtasks       Task[]    @relation("TaskSubtasks")
  tags           TaskTag[]
  links          TaskLink[]

  @@unique([userId, source, externalId])
  @@index([userId, status])
  @@index([userId, dueDate])
  @@index([userId, priority])
  @@index([userId, createdAt])
  @@index([noteId])
  @@index([createdByTokenId])
  @@index([parentTaskId])
  @@map("tasks")
}

// WAITING was appended last (ALTER TYPE ... ADD VALUE); APIs list statuses in
// workflow order: PENDING, IN_PROGRESS, WAITING, COMPLETED, CANCELLED
enum TaskStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
  WAITING
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Task identifier |
| userId | UUID | FK → User | Owner |
| title | VARCHAR(500) | Required | Task title |
| description | Text | Optional | Detailed description |
| status | Enum | Default: PENDING | Task status |
| priority | Enum | Default: MEDIUM | Priority level |
| dueDate | Timestamp? | Nullable | Due date |
| noteId | UUID? | FK → Note | Linked note (optional) |
| noteTitle | VARCHAR(500)? | Cached | Note title cache |
| folderId | UUID? | FK → Folder | Organization folder |
| createdByTokenId | UUID? | FK → ApiToken, SET NULL | Agent attribution (token that created it) |
| waitingOn | VARCHAR(255)? | Nullable | Who or what a WAITING task waits on; free text, never cleared by the server |
| source | VARCHAR(50)? | With externalId | System that filed the task (e.g. `foyer`); `^[a-z][a-z0-9_-]{1,49}$` |
| externalId | VARCHAR(255)? | With source | The task's id in that system; set at creation, never updated |
| startDate | Timestamp? | Nullable, not after dueDate | Do not start before (snooze) |
| parentTaskId | UUID? | FK → Task, SET NULL | Parent task; one level only (enforced in `task.service.ts`) |
| completedAt | Timestamp? | Auto-set | When completed |

**Indexes and constraints:**
- `(userId, source, externalId)` UNIQUE - De-duplicates synced tasks; rows with NULLs never collide
- `(userId, status)` - Fast status filtering
- `(userId, dueDate)` - Due date queries
- `(userId, priority)`, `(userId, createdAt)` - Sorting
- `(noteId)` - Find tasks by note
- `(createdByTokenId)` - Agent attribution
- `(parentTaskId)` - Subtasks of a task

**Subtask rules** (service layer, inside the write transaction, rows locked with `SELECT ... FOR UPDATE`): a task cannot be its own parent; the parent must belong to the same user and must not itself have a parent; a task that has subtasks cannot take a parent. So the hierarchy is one level deep and cannot cycle. Deleting a parent sets its subtasks' `parentTaskId` to NULL (they become top-level tasks).

### TaskTag (Junction)

Many-to-many relationship between tasks and tags.

```prisma
model TaskTag {
  taskId String @map("task_id")
  tagId  String @map("tag_id")

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([taskId, tagId])
  @@map("task_tags")
}
```

### SystemSetting

Key-value store for system-wide configuration.

```prisma
model SystemSetting {
  key       String   @id @db.VarChar(100)
  value     String?  @db.Text
  encrypted Boolean  @default(false)
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("system_settings")
}
```

| Field | Type | Description |
|-------|------|-------------|
| key | VARCHAR(100) | Setting key (PK) |
| value | Text | Setting value |
| encrypted | Boolean | Whether value is encrypted |

### UserAISettings

Per-user AI provider configuration with encrypted API keys.

```prisma
model UserAISettings {
  id               String   @id @default(uuid())
  userId           String   @unique @map("user_id")
  provider         String   @db.VarChar(20)
  encryptedApiKey  String   @map("encrypted_api_key") @db.Text
  model            String?  @db.VarChar(100)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_ai_settings")
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Settings identifier |
| userId | UUID | Owner (unique - one per user) |
| provider | VARCHAR(20) | "anthropic", "openai", or "gemini" |
| encryptedApiKey | Text | AES-256-GCM encrypted API key |
| model | VARCHAR(100)? | Selected model ID |

## Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20251014124121_init` | 2024-10-14 | Initial schema (users, sessions, folders, notes, tags) |
| `20251016172544_add_user_ai_settings` | 2024-10-16 | Per-user AI configuration |
| `20251017022124_add_fulltext_search` | 2024-10-17 | PostgreSQL tsvector for search |
| `20251024154646_add_soft_delete` | 2024-10-24 | Soft delete for notes (trash) |
| `20251108112012_add_task_system` | 2024-11-08 | Task management system |
| `20261013000000_task_waiting_source_start_parent` | 2026-10-13 | WAITING status; `waiting_on`, `source`, `external_id`, `start_date`, `parent_task_id`; unique `(user_id, source, external_id)`; parent index and FK (additive) |

Migrations between these two are listed in `backend/prisma/migrations/`.

## Database Indexes

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| notes | search_vector | GIN | Full-text search |
| tasks | (userId, status) | B-tree | Status filtering |
| tasks | (userId, dueDate) | B-tree | Due date queries |
| tasks | (noteId) | B-tree | Note-task lookup |
| tasks | (userId, source, externalId) | B-tree, UNIQUE | Synced-task de-duplication |
| tasks | (parentTaskId) | B-tree | Subtask lookup |

## Cascade Delete Rules

| Parent | Child | On Delete |
|--------|-------|-----------|
| User | Session | CASCADE |
| User | Folder | CASCADE |
| User | Note | CASCADE |
| User | Tag | CASCADE |
| User | Task | CASCADE |
| User | UserAISettings | CASCADE |
| Folder | Note | SET NULL |
| Folder | Task | SET NULL |
| Note | NoteTag | CASCADE |
| Note | Task | CASCADE |
| Tag | NoteTag | CASCADE |
| Tag | TaskTag | CASCADE |
| Task | TaskTag | CASCADE |
| Task | Task (subtasks) | SET NULL |

## Full-Text Search Implementation

PostgreSQL trigger automatically maintains the `search_vector` column:

```sql
CREATE OR REPLACE FUNCTION update_note_searchable()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_searchable
BEFORE INSERT OR UPDATE ON notes
FOR EACH ROW
EXECUTE FUNCTION update_note_searchable();
```

**Search Query Example:**
```sql
SELECT id, title, ts_rank(search_vector, query) as rank
FROM notes, plainto_tsquery('english', 'search term') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

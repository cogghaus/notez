import type { FastifyInstance, FastifyRequest, FastifyError } from 'fastify';
import { authenticateApiToken, requireScope } from '../middleware/auth.middleware.js';
import { validateQuery, validateParams, validateBody } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { searchService } from '../services/search.service.js';
import { getNoteById, getNoteByTitle, listNotes, createNote, updateNote, deleteNote, restoreNote } from '../services/note.service.js';
import { getTaskById, getTaskByExternalId, listTasks, createTask, updateTaskStatus, updateTask, deleteTask } from '../services/task.service.js';
import { listFolders, createFolder, updateFolder, deleteFolder } from '../services/folder.service.js';
import { listTags, renameTag, deleteTag } from '../services/tag.service.js';
import { shareNote, listSharesForNote, unshareNote, updateSharePermission } from '../services/share.service.js';
import { hashToken } from '../services/token.service.js';
import { BadRequestError } from '../utils/errors.js';
import {
  FOLDER_ICONS,
  TASK_SORT_FIELDS,
  TASK_EXTERNAL_ID_NEEDS_SOURCE_MESSAGE,
  TASK_SYNC_IDENTITY_IMMUTABLE_MESSAGE,
  taskStatusSchema,
  taskSourceSchema,
  taskExternalIdSchema,
  taskParentIdSchema,
  taskStartDateSchema,
  taskWaitingOnSchema,
  taskLinkSchema,
  refineTaskCreate,
  refineTaskDates,
} from '../utils/validation.schemas.js';
import { htmlToPlainText } from '../utils/html.js';

// --- Query/Body schemas for MCP routes ---

const searchNotesQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const recentNotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const noteByTitleQuery = z.object({
  title: z.string().min(1).max(500),
});

const noteIdParam = z.object({
  id: z.string().uuid(),
});

const createNoteBody = z.object({
  title: z.string().min(1).max(500),
  content: z.string().max(500000).optional(),
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
});

const appendNoteBody = z.object({
  content: z.string().min(1).max(50000),
});

// status: one value, or a comma-separated list (?status=PENDING,IN_PROGRESS,WAITING)
const statusListParam = z.preprocess(
  (val) => (typeof val === 'string' && val.includes(',') ? val.split(',').map((s) => s.trim()) : val),
  z.union([taskStatusSchema, z.array(taskStatusSchema).min(1)])
);

const listTasksQuery = z.object({
  status: statusListParam.optional(),
  source: taskSourceSchema.optional(),
  externalId: taskExternalIdSchema.optional(),
  parentTaskId: taskParentIdSchema.optional(),
  folderId: z.string().uuid().optional(),
  createdByTokenId: z.string().uuid().optional(),
  agentCreated: z.coerce.boolean().optional(),
  sortBy: z.enum(TASK_SORT_FIELDS).default('priority'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).refine((q) => q.externalId === undefined || q.source !== undefined, {
  message: TASK_EXTERNAL_ID_NEEDS_SOURCE_MESSAGE,
  path: ['externalId'],
});

const taskByExternalIdQuery = z.object({
  source: taskSourceSchema,
  externalId: taskExternalIdSchema,
});

const taskIdParam = z.object({
  id: z.string().uuid(),
});

const createTaskBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  status: taskStatusSchema.default('PENDING').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM').optional(),
  dueDate: z.string().datetime().optional(),
  startDate: taskStartDateSchema.optional(),
  folderId: z.string().uuid().optional(),
  noteId: z.string().uuid().optional(),
  parentTaskId: taskParentIdSchema.optional(),
  waitingOn: taskWaitingOnSchema.optional(),
  source: taskSourceSchema.optional(),
  externalId: taskExternalIdSchema.optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  links: z.array(taskLinkSchema).max(10, 'Maximum 10 links per task').optional(),
}).superRefine(refineTaskCreate);

const updateTaskStatusBody = z.object({
  status: taskStatusSchema,
});

const listNotesQuery = z.object({
  folderId: z.preprocess(
    (val) => (val === 'null' ? null : val),
    z.string().uuid().nullable()
  ).optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  createdByTokenId: z.string().uuid().optional(),
  agentCreated: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateNoteBody = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().max(500000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' }
);

const updateTaskBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(50000).optional(),
  status: taskStatusSchema.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: taskStartDateSchema.nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  noteId: z.string().uuid().nullable().optional(),
  parentTaskId: taskParentIdSchema.nullable().optional(),
  waitingOn: taskWaitingOnSchema.nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  // Replaces all links, as the session route does
  links: z.array(taskLinkSchema).max(10, 'Maximum 10 links per task').optional(),
  // Refused: the sync identity is fixed at creation so de-duplication stays honest
  source: z.undefined({ errorMap: () => ({ message: TASK_SYNC_IDENTITY_IMMUTABLE_MESSAGE }) }),
  externalId: z.undefined({ errorMap: () => ({ message: TASK_SYNC_IDENTITY_IMMUTABLE_MESSAGE }) }),
}).superRefine(refineTaskDates).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' }
);

const createFolderBody = z.object({
  name: z.string().min(1).max(255),
  icon: z.enum(FOLDER_ICONS).default('folder').optional(),
});

const updateFolderBody = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.enum(FOLDER_ICONS).optional(),
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' }
);

const folderIdParam = z.object({
  id: z.string().uuid(),
});

const tagIdParam = z.object({
  id: z.string().uuid(),
});

const renameTagBody = z.object({
  name: z.string().min(1).max(100),
});

const shareNoteBody = z.object({
  usernameOrEmail: z.string().min(1).max(255),
  permission: z.enum(['VIEW', 'EDIT']).default('VIEW').optional(),
});

const shareIdParam = z.object({
  id: z.string().uuid(),
  shareId: z.string().uuid(),
});

const updateSharePermissionBody = z.object({
  permission: z.enum(['VIEW', 'EDIT']),
});

/**
 * Per-token rate limit config for MCP routes (120 requests/min per token)
 */
const perTokenRateLimit = {
  rateLimit: {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const auth = request.headers.authorization || '';
      if (auth.startsWith('Bearer ntez_')) {
        return `mcp:${hashToken(auth.substring(7))}`;
      }
      return `mcp:${request.ip}`;
    },
  },
};

/**
 * MCP API routes — consumed by the notez-mcp stdio server
 * All routes authenticated via API token (ntez_ prefix)
 *
 * Error handling: Plugin-level setErrorHandler maps errors centrally.
 * - AppError subclasses (NotFoundError, BadRequestError, etc.) → use statusCode
 * - Service layer "not found" plain errors → 404
 * - Everything else → 500
 */
export async function mcpRoutes(fastify: FastifyInstance) {
  // Plugin-level error handler — maps all errors centrally instead of per-handler try/catch
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Typed AppError subclasses (NotFoundError, BadRequestError, etc.)
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.name || 'Error',
        message: error.message,
      });
    }

    // Service layer "not found" errors (legacy — services throw plain Error)
    if (error.message?.toLowerCase().includes('not found')) {
      return reply.code(404).send({
        error: 'Not Found',
        message: error.message,
      });
    }

    // Everything else → 500
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // All routes require API token authentication
  fastify.addHook('preHandler', authenticateApiToken);

  // ─── Notes (read scope) ───────────────────────────────────────────────

  // Search notes by keyword
  fastify.get(
    '/notes/search',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(searchNotesQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { q, limit } = request.query as z.infer<typeof searchNotesQuery>;

      return searchService.searchNotes({ query: q, userId, limit });
    }
  );

  // Get note by exact title (case-insensitive)
  fastify.get(
    '/notes/by-title',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(noteByTitleQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { title } = request.query as z.infer<typeof noteByTitleQuery>;

      const note = await getNoteByTitle(title, userId);
      return {
        ...note,
        plainText: note.content ? htmlToPlainText(note.content) : null,
      };
    }
  );

  // List notes with optional folder/tag/search filters
  fastify.get(
    '/notes',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(listNotesQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const query = request.query as z.infer<typeof listNotesQuery>;

      return listNotes(userId, {
        folderId: query.folderId,
        tagId: query.tagId,
        search: query.search,
        createdByTokenId: query.createdByTokenId,
        agentCreated: query.agentCreated,
        limit: query.limit,
        offset: query.offset,
      });
    }
  );

  // List recently modified notes
  fastify.get(
    '/notes/recent',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(recentNotesQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { limit, offset } = request.query as z.infer<typeof recentNotesQuery>;

      return listNotes(userId, { limit, offset });
    }
  );

  // Get note by ID (full content + plainText)
  fastify.get(
    '/notes/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateParams(noteIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      const note = await getNoteById(id, userId);
      return {
        ...note,
        plainText: note.content ? htmlToPlainText(note.content) : null,
      };
    }
  );

  // ─── Notes (write scope) ──────────────────────────────────────────────

  // Create a new note
  fastify.post(
    '/notes',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateBody(createNoteBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const body = request.body as z.infer<typeof createNoteBody>;

      const note = await createNote(userId, body, request.apiTokenId);
      reply.code(201);
      return note;
    }
  );

  // Append content to an existing note
  fastify.patch(
    '/notes/:id/append',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam), validateBody(appendNoteBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { content: appendContent } = request.body as z.infer<typeof appendNoteBody>;

      const note = await getNoteById(id, userId);
      const existingContent = note.content || '';
      const newContent = existingContent + appendContent;

      // Guard against unbounded growth
      const MAX_NOTE_CONTENT = 500_000;
      if (newContent.length > MAX_NOTE_CONTENT) {
        throw new BadRequestError('Note content would exceed maximum size (500KB)');
      }

      return updateNote(id, userId, { content: newContent }, request.apiTokenId);
    }
  );

  // Update a note (title, content, folder, tags)
  fastify.patch(
    '/notes/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam), validateBody(updateNoteBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateNoteBody>;

      return updateNote(id, userId, body, request.apiTokenId);
    }
  );

  // Delete a note (soft delete — moves to trash)
  fastify.delete(
    '/notes/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return deleteNote(id, userId);
    }
  );

  // Restore a note from trash
  fastify.post(
    '/notes/:id/restore',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return restoreNote(id, userId);
    }
  );

  // ─── Tasks (read scope) ───────────────────────────────────────────────

  // List tasks: status (one or a comma list), sync identity, parent and folder
  // filters, sorting and paging
  fastify.get(
    '/tasks',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(listTasksQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const query = request.query as z.infer<typeof listTasksQuery>;

      return listTasks(userId, {
        status: query.status,
        source: query.source,
        externalId: query.externalId,
        parentTaskId: query.parentTaskId,
        folderId: query.folderId,
        createdByTokenId: query.createdByTokenId,
        agentCreated: query.agentCreated,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        limit: query.limit,
        offset: query.offset,
      });
    }
  );

  // Get task by sync identity. Declared before /tasks/:id (find-my-way also
  // prefers the static segment, but the order documents the intent).
  fastify.get(
    '/tasks/by-external-id',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateQuery(taskByExternalIdQuery)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { source, externalId } = request.query as z.infer<typeof taskByExternalIdQuery>;

      return getTaskByExternalId(userId, source, externalId);
    }
  );

  // Get task by ID
  fastify.get(
    '/tasks/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateParams(taskIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return getTaskById(id, userId);
    }
  );

  // ─── Tasks (write scope) ──────────────────────────────────────────────

  // Create a new task
  fastify.post(
    '/tasks',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateBody(createTaskBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const body = request.body as z.infer<typeof createTaskBody>;

      const task = await createTask(userId, body, request.apiTokenId);
      reply.code(201);
      return task;
    }
  );

  // Update task status
  fastify.patch(
    '/tasks/:id/status',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(taskIdParam), validateBody(updateTaskStatusBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { status } = request.body as z.infer<typeof updateTaskStatusBody>;

      return updateTaskStatus(id, userId, status);
    }
  );

  // Update a task (everything but the sync identity; links and tags are replaced)
  fastify.patch(
    '/tasks/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(taskIdParam), validateBody(updateTaskBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateTaskBody>;

      return updateTask(id, userId, body, request.apiTokenId);
    }
  );

  // Delete a task
  fastify.delete(
    '/tasks/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(taskIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return deleteTask(id, userId);
    }
  );

  // ─── Folders ────────────────────────────────────────────────────────────

  // List all folders
  fastify.get(
    '/folders',
    { config: perTokenRateLimit, preHandler: requireScope('read') },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      return listFolders(userId);
    }
  );

  // Create a folder
  fastify.post(
    '/folders',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateBody(createFolderBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const body = request.body as z.infer<typeof createFolderBody>;

      const folder = await createFolder(userId, body, request.apiTokenId);
      reply.code(201);
      return folder;
    }
  );

  // Update/rename a folder
  fastify.patch(
    '/folders/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(folderIdParam), validateBody(updateFolderBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof updateFolderBody>;

      return updateFolder(id, userId, body);
    }
  );

  // Delete a folder
  fastify.delete(
    '/folders/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(folderIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return deleteFolder(id, userId);
    }
  );

  // ─── Tags ───────────────────────────────────────────────────────────────

  // List all tags
  fastify.get(
    '/tags',
    { config: perTokenRateLimit, preHandler: requireScope('read') },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      return listTags(userId);
    }
  );

  // Rename a tag
  fastify.patch(
    '/tags/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(tagIdParam), validateBody(renameTagBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { name } = request.body as z.infer<typeof renameTagBody>;

      return renameTag(id, userId, name);
    }
  );

  // Delete a tag
  fastify.delete(
    '/tags/:id',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(tagIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return deleteTag(id, userId);
    }
  );

  // ─── Sharing ────────────────────────────────────────────────────────────

  // Share a note with another user
  fastify.post(
    '/notes/:id/shares',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(noteIdParam), validateBody(shareNoteBody)] },
    async (request: FastifyRequest, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { usernameOrEmail, permission } = request.body as z.infer<typeof shareNoteBody>;

      const share = await shareNote(id, userId, usernameOrEmail, permission);
      reply.code(201);
      return share;
    }
  );

  // List shares for a note
  fastify.get(
    '/notes/:id/shares',
    { config: perTokenRateLimit, preHandler: [requireScope('read'), validateParams(noteIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      return listSharesForNote(id, userId);
    }
  );

  // Update share permission
  fastify.patch(
    '/notes/:id/shares/:shareId',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(shareIdParam), validateBody(updateSharePermissionBody)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id, shareId } = request.params as { id: string; shareId: string };
      const { permission } = request.body as z.infer<typeof updateSharePermissionBody>;

      return updateSharePermission(id, userId, shareId, permission);
    }
  );

  // Remove a share
  fastify.delete(
    '/notes/:id/shares/:shareId',
    { config: perTokenRateLimit, preHandler: [requireScope('write'), validateParams(shareIdParam)] },
    async (request: FastifyRequest) => {
      const userId = request.user!.userId;
      const { id, shareId } = request.params as { id: string; shareId: string };

      return unshareNote(id, userId, shareId);
    }
  );
}

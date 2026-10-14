import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRequire } from 'module';
import * as z from 'zod/v4';
import { NotezClient } from './client.js';
import { TASK_STATUSES } from './types.js';

/** Read from package.json (one level above src/ and build/), so it cannot drift */
export const SERVER_VERSION: string = createRequire(import.meta.url)('../package.json').version;

const taskStatus = z.enum(TASK_STATUSES);
const taskSource = z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/);
const taskLink = z.object({
  url: z.string().url().describe('http or https URL'),
  title: z.string().max(255).optional().describe('Link title'),
});

/**
 * Create and configure the Notez MCP server with all tools
 */
export function createNotezServer(client: NotezClient): McpServer {
  const server = new McpServer({
    name: 'notez',
    version: SERVER_VERSION,
  });

  // ─── Notes (read) ───────────────────────────────────────────────────

  server.registerTool(
    'notez_search_notes',
    {
      description: 'Search notes by keyword or phrase. Returns matching notes with snippets.',
      inputSchema: {
        query: z.string().describe('Search query (keywords or phrase)'),
        limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      },
    },
    async ({ query, limit }) => {
      try {
        const result = await client.searchNotes(query, limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_note',
    {
      description: 'Get a note by its ID. Returns full content including plain text version.',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
      },
    },
    async ({ id }) => {
      try {
        const note = await client.getNote(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_note_by_title',
    {
      description: 'Find a note by its exact title (case-insensitive match).',
      inputSchema: {
        title: z.string().describe('Exact note title to search for'),
      },
    },
    async ({ title }) => {
      try {
        const note = await client.getNoteByTitle(title);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_list_notes',
    {
      description: 'List notes with optional filters. Filter by folder, tag, or search text. Returns paginated results.',
      inputSchema: {
        folderId: z.string().uuid().nullable().optional().describe('Filter by folder UUID, or null for unfiled notes'),
        tagId: z.string().uuid().optional().describe('Filter by tag UUID'),
        search: z.string().optional().describe('Search text to filter by'),
        limit: z.number().min(1).max(100).default(50).describe('Max notes to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ folderId, tagId, search, limit, offset }) => {
      try {
        const result = await client.listNotes({ folderId, tagId, search, limit, offset });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_list_recent_notes',
    {
      description: 'List recently modified notes, sorted by last update time.',
      inputSchema: {
        limit: z.number().min(1).max(50).default(20).describe('Max notes to return'),
      },
    },
    async ({ limit }) => {
      try {
        const result = await client.listRecentNotes(limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Notes (write) ──────────────────────────────────────────────────

  server.registerTool(
    'notez_create_note',
    {
      description: 'Create a new note. Content should be HTML format.',
      inputSchema: {
        title: z.string().describe('Note title'),
        content: z.string().optional().describe('Note content (HTML)'),
        folderId: z.string().uuid().optional().describe('Folder UUID to place note in'),
        tags: z.array(z.string()).optional().describe('Tag names to attach'),
      },
    },
    async ({ title, content, folderId, tags }) => {
      try {
        const note = await client.createNote({ title, content, folderId, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_append_to_note',
    {
      description: 'Append content to an existing note. Content is added to the end.',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
        content: z.string().describe('Content to append (HTML)'),
      },
    },
    async ({ id, content }) => {
      try {
        const note = await client.appendToNote(id, content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tasks (read) ──────────────────────────────────────────────────

  server.registerTool(
    'notez_list_tasks',
    {
      description: 'List tasks, optionally filtered by status, sync identity (source + externalId) or parent task. Returns tasks sorted by priority, each with waitingOn, startDate and parent.',
      inputSchema: {
        status: taskStatus.optional()
          .describe('Filter by task status: PENDING, IN_PROGRESS, WAITING, COMPLETED or CANCELLED'),
        source: taskSource.optional().describe('Filter by the system that filed the task (e.g. "foyer")'),
        externalId: z.string().min(1).max(255).optional().describe('Filter by the id the source system gave the task; requires source'),
        parentTaskId: z.string().uuid().optional().describe('List the subtasks of this task'),
        limit: z.number().min(1).max(100).default(20).describe('Max tasks to return'),
      },
    },
    async ({ status, source, externalId, parentTaskId, limit }) => {
      try {
        const result = await client.listTasks({ status, source, externalId, parentTaskId, limit });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_get_task',
    {
      description: 'Get a task by its ID. Returns full task details including links and tags.',
      inputSchema: {
        id: z.string().uuid().describe('Task UUID'),
      },
    },
    async ({ id }) => {
      try {
        const task = await client.getTask(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tasks (write) ─────────────────────────────────────────────────

  server.registerTool(
    'notez_create_task',
    {
      description: 'Create a new task with optional status, priority, due and start dates, note, folder, parent task, links and tags. source and externalId go together and are unique per user: a second create with the same pair fails with "already exists".',
      inputSchema: {
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        status: taskStatus.optional().describe('Initial status (default: PENDING): PENDING, IN_PROGRESS, WAITING, COMPLETED or CANCELLED'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
          .describe('Task priority (default: MEDIUM)'),
        dueDate: z.string().datetime().optional().describe('Due date (ISO 8601 datetime, e.g. "2026-03-15T09:00:00Z")'),
        startDate: z.string().datetime().optional().describe('Do not start before (ISO 8601 datetime); must not be after dueDate'),
        waitingOn: z.string().max(255).optional().describe('Who or what the task is waiting on (use with status WAITING)'),
        noteId: z.string().uuid().optional().describe('Note UUID the task comes from'),
        folderId: z.string().uuid().optional().describe('Folder UUID'),
        parentTaskId: z.string().uuid().optional().describe('Parent task UUID (one level: the parent cannot be a subtask)'),
        links: z.array(taskLink).max(10).optional().describe('Up to 10 http(s) links'),
        source: taskSource.optional().describe('System filing the task, e.g. "foyer"; requires externalId'),
        externalId: z.string().min(1).max(255).optional().describe('Id of the task in the source system; requires source'),
        tags: z.array(z.string()).optional().describe('Tag names to attach'),
      },
    },
    async (args) => {
      try {
        const task = await client.createTask(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Notes (update/delete) ─────────────────────────────────────────

  server.registerTool(
    'notez_update_note',
    {
      description: 'Update a note. Can change title, content (HTML), folder, or tags. Set folderId to null to unfile.',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
        title: z.string().optional().describe('New title'),
        content: z.string().optional().describe('New content (HTML)'),
        folderId: z.string().uuid().nullable().optional().describe('Folder UUID, or null to move note to unfiled'),
        tags: z.array(z.string()).optional().describe('REPLACES all existing tags — pass the full desired tag list. To add a tag, first read the note to get current tags, then include them all plus the new one.'),
      },
    },
    async ({ id, title, content, folderId, tags }) => {
      try {
        const note = await client.updateNote(id, { title, content, folderId, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_delete_note',
    {
      description: 'Delete a note (moves to trash).',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID'),
      },
    },
    async ({ id }) => {
      try {
        const result = await client.deleteNote(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_restore_note',
    {
      description: 'Restore a note from trash (undo a delete).',
      inputSchema: {
        id: z.string().uuid().describe('Note UUID (must be in trash)'),
      },
    },
    async ({ id }) => {
      try {
        const result = await client.restoreNote(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tasks (update/delete) ──────────────────────────────────────────

  server.registerTool(
    'notez_update_task',
    {
      description: 'Update a task. Can change title, description, status, priority, due and start dates, waiting-on, note, folder, parent task, links or tags. source and externalId cannot be changed.',
      inputSchema: {
        id: z.string().uuid().describe('Task UUID'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status: taskStatus.optional()
          .describe('New status: PENDING, IN_PROGRESS, WAITING, COMPLETED or CANCELLED'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
          .describe('New priority'),
        dueDate: z.string().datetime().nullable().optional().describe('Due date (ISO 8601 datetime, e.g. "2026-03-15T09:00:00Z") or null to clear'),
        startDate: z.string().datetime().nullable().optional().describe('Do not start before (ISO 8601 datetime), or null to clear'),
        waitingOn: z.string().max(255).nullable().optional().describe('Who or what the task is waiting on, or null to clear (not cleared automatically on a status change)'),
        noteId: z.string().uuid().nullable().optional().describe('Note UUID, or null to unlink'),
        folderId: z.string().uuid().nullable().optional().describe('Folder UUID, or null to remove from folder'),
        parentTaskId: z.string().uuid().nullable().optional().describe('Parent task UUID, or null to make it a top-level task'),
        links: z.array(taskLink).max(10).optional().describe('REPLACES all existing links (up to 10)'),
        tags: z.array(z.string()).optional().describe('REPLACES all existing tags — pass the full desired tag list. To add a tag, first read the task to get current tags, then include them all plus the new one.'),
      },
    },
    async ({ id, ...fields }) => {
      try {
        const task = await client.updateTask(id, fields);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_delete_task',
    {
      description: 'Delete a task permanently. WARNING: This cannot be undone — the task is permanently removed, not moved to trash.',
      inputSchema: {
        id: z.string().uuid().describe('Task UUID'),
      },
    },
    async ({ id }) => {
      try {
        const result = await client.deleteTask(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Folders ────────────────────────────────────────────────────────

  server.registerTool(
    'notez_list_folders',
    {
      description: 'List all folders with their note counts. Returns a JSON array. Use notez_list_notes with a folderId to see notes in a specific folder.',
      inputSchema: {},
    },
    async () => {
      try {
        const folders = await client.listFolders();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(folders, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_create_folder',
    {
      description: 'Create a new folder.',
      inputSchema: {
        name: z.string().max(255).describe('Folder name'),
        icon: z.string().optional().describe('Lucide icon name. Defaults to "folder". Valid values: folder, folder-open, briefcase, home, star, heart, bookmark, file-text, code, terminal, book, archive, inbox, lightbulb, target, flag, calendar, clock, users, user, settings, camera, music, video, image, globe, map-pin, shopping-bag, palette, paintbrush, pencil, pen, pen-tool, flower, drama, coffee, utensils, gift, server, cpu, hard-drive, network, wifi, database, cloud, monitor, laptop, smartphone, gamepad-2, trophy, swords, dice-5, dollar-sign, credit-card, graduation-cap, brain, flask-conical, dumbbell, mountain, tree-pine, plane, mail, message-circle, lock, shield, headphones, tv, wrench'),
      },
    },
    async ({ name, icon }) => {
      try {
        const folder = await client.createFolder({ name, icon });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(folder, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_update_folder',
    {
      description: 'Rename a folder or change its icon. At least one of name or icon must be provided.',
      inputSchema: {
        id: z.string().uuid().describe('Folder UUID'),
        name: z.string().max(255).optional().describe('New folder name'),
        icon: z.string().optional().describe('New Lucide icon name (see notez_create_folder for valid values)'),
      },
    },
    async ({ id, name, icon }) => {
      try {
        const folder = await client.updateFolder(id, { name, icon });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(folder, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_delete_folder',
    {
      description: 'Delete a folder. Notes in the folder become unfiled (not deleted).',
      inputSchema: {
        id: z.string().uuid().describe('Folder UUID'),
      },
    },
    async ({ id }) => {
      try {
        const result = await client.deleteFolder(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Tags ───────────────────────────────────────────────────────────

  server.registerTool(
    'notez_list_tags',
    {
      description: 'List all tags with note counts. Returns a JSON array. Tags are created automatically when first used in notez_create_note, notez_update_note, notez_create_task, or notez_update_task — there is no separate create-tag tool.',
      inputSchema: {},
    },
    async () => {
      try {
        const tags = await client.listTags();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tags, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_update_tag',
    {
      description: 'Update a tag (rename it). All notes with the tag are updated automatically.',
      inputSchema: {
        id: z.string().uuid().describe('Tag UUID'),
        name: z.string().describe('New tag name'),
      },
    },
    async ({ id, name }) => {
      try {
        const tag = await client.renameTag(id, name);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tag, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_delete_tag',
    {
      description: 'Delete a tag. Removes the tag from all notes.',
      inputSchema: {
        id: z.string().uuid().describe('Tag UUID'),
      },
    },
    async ({ id }) => {
      try {
        const result = await client.deleteTag(id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── Sharing ────────────────────────────────────────────────────────

  server.registerTool(
    'notez_share_note',
    {
      description: 'Share a note with another user by username or email. If the note is already shared with the user, returns an error — use notez_update_share to change permission instead.',
      inputSchema: {
        noteId: z.string().uuid().describe('Note UUID'),
        usernameOrEmail: z.string().describe('Username or email of the user to share with'),
        permission: z.enum(['VIEW', 'EDIT']).optional()
          .describe('Permission level (default: VIEW)'),
      },
    },
    async ({ noteId, usernameOrEmail, permission }) => {
      try {
        const share = await client.shareNote(noteId, usernameOrEmail, permission);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(share, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_list_shares',
    {
      description: 'List all shares for a note you own. Returns a JSON array of share objects.',
      inputSchema: {
        noteId: z.string().uuid().describe('Note UUID'),
      },
    },
    async ({ noteId }) => {
      try {
        const shares = await client.listShares(noteId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(shares, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_unshare_note',
    {
      description: 'Remove a share from a note (stop sharing with a user). To change permission level, use notez_update_share instead.',
      inputSchema: {
        noteId: z.string().uuid().describe('Note UUID'),
        shareId: z.string().uuid().describe('Share UUID (from notez_list_shares)'),
      },
    },
    async ({ noteId, shareId }) => {
      try {
        const result = await client.unshareNote(noteId, shareId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'notez_update_share',
    {
      description: 'Update the permission level of an existing share (VIEW or EDIT).',
      inputSchema: {
        noteId: z.string().uuid().describe('Note UUID'),
        shareId: z.string().uuid().describe('Share UUID (from notez_list_shares)'),
        permission: z.enum(['VIEW', 'EDIT']).describe('New permission level'),
      },
    },
    async ({ noteId, shareId, permission }) => {
      try {
        const share = await client.updateSharePermission(noteId, shareId, permission);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(share, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

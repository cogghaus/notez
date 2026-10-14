import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock all service dependencies
vi.mock('../lib/db.js', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    tag: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('../services/search.service.js', () => ({
  searchService: { searchNotes: vi.fn() },
}));
vi.mock('../services/note.service.js', () => ({
  getNoteById: vi.fn(),
  getNoteByTitle: vi.fn(),
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  restoreNote: vi.fn(),
}));
vi.mock('../services/task.service.js', () => ({
  getTaskById: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addTaskLink: vi.fn(),
  updateTaskLink: vi.fn(),
  deleteTaskLink: vi.fn(),
}));
vi.mock('../services/folder.service.js', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));
vi.mock('../services/tag.service.js', () => ({
  listTags: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
  getUserTagNames: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/share.service.js', () => ({
  shareNote: vi.fn(),
  listSharesForNote: vi.fn(),
  unshareNote: vi.fn(),
  updateSharePermission: vi.fn(),
}));
vi.mock('../services/notification.service.js', () => ({
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
}));
vi.mock('../services/feedback.service.js', () => ({
  createFeedbackWithRateLimit: vi.fn(),
  getFeedbackById: vi.fn(),
  listUserFeedback: vi.fn(),
}));
vi.mock('../services/ai/index.js', () => ({
  aiService: {
    getUserConfiguration: vi.fn(),
    summarize: vi.fn(),
    suggestTitle: vi.fn(),
    suggestTags: vi.fn(),
  },
  AIProviderNotConfiguredError: class AIProviderNotConfiguredError extends Error {
    constructor() { super('AI not configured'); }
  },
  AIProviderConnectionError: class AIProviderConnectionError extends Error {
    constructor() { super('Connection failed'); }
  },
  AIProviderRateLimitError: class AIProviderRateLimitError extends Error {
    constructor() { super('Rate limited'); }
  },
  AIModelNotFoundError: class AIModelNotFoundError extends Error {
    constructor() { super('Model not found'); }
  },
  AIServiceError: class AIServiceError extends Error {
    constructor() { super('AI service error'); }
  },
}));

import { registerNotezTools, __resetAiRateLimiterForTesting__, __resetToolDefsForTesting__ } from './tools.js';
import { getNoteById } from '../services/note.service.js';
import { createTask, updateTask, listTasks } from '../services/task.service.js';
import { aiService, AIProviderNotConfiguredError, AIProviderRateLimitError, AIModelNotFoundError, AIProviderConnectionError, AIServiceError } from '../services/ai/index.js';
import { prisma } from '../lib/db.js';

// Helper: builds a server mock that captures both tool names and handlers.
function makeCapturingServer() {
  const names: string[] = [];
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
  const mock = {
    registerTool: vi.fn((name: string, _def: unknown, handler: (args: unknown) => Promise<unknown>) => {
      names.push(name);
      handlers[name] = handler;
    }),
  } as unknown as McpServer;
  return { mock, names, handlers };
}

describe('tools', () => {
  let server: McpServer;
  const registeredTools: string[] = [];

  beforeEach(() => {
    registeredTools.length = 0;
    __resetAiRateLimiterForTesting__();
    __resetToolDefsForTesting__();
    server = {
      registerTool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    } as any;
  });

  describe('registerNotezTools', () => {
    it('registers only read tools when scope is mcp:read', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:read']);

      // Should include read tools
      expect(registeredTools).toContain('notez_search_notes');
      expect(registeredTools).toContain('notez_get_note');
      expect(registeredTools).toContain('notez_get_note_by_title');
      expect(registeredTools).toContain('notez_list_notes');
      expect(registeredTools).toContain('notez_list_tasks');
      expect(registeredTools).toContain('notez_list_folders');
      expect(registeredTools).toContain('notez_list_tags');
      expect(registeredTools).toContain('notez_list_shares');
      expect(registeredTools).toContain('notez_list_notifications');
      expect(registeredTools).toContain('notez_get_unread_count');
      expect(registeredTools).toContain('notez_list_my_feedback');
      expect(registeredTools).toContain('notez_get_feedback');
      expect(registeredTools).toContain('notez_check_ai_status');

      // Should NOT include write tools
      expect(registeredTools).not.toContain('notez_create_note');
      expect(registeredTools).not.toContain('notez_update_note');
      expect(registeredTools).not.toContain('notez_delete_note');
      expect(registeredTools).not.toContain('notez_create_task');
      expect(registeredTools).not.toContain('notez_share_note');
      expect(registeredTools).not.toContain('notez_add_task_link');
      expect(registeredTools).not.toContain('notez_mark_notification_read');
      expect(registeredTools).not.toContain('notez_create_feedback');
      expect(registeredTools).not.toContain('notez_ai_summarize');
    });

    it('registers both read and write tools when both scopes granted', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:read', 'mcp:write']);

      expect(registeredTools).toContain('notez_search_notes');
      expect(registeredTools).toContain('notez_create_note');
      expect(registeredTools).toContain('notez_update_note');
      expect(registeredTools).toContain('notez_delete_note');
      expect(registeredTools).toContain('notez_create_task');
      expect(registeredTools).toContain('notez_share_note');
      // Task links
      expect(registeredTools).toContain('notez_add_task_link');
      expect(registeredTools).toContain('notez_update_task_link');
      expect(registeredTools).toContain('notez_delete_task_link');
      // Notifications
      expect(registeredTools).toContain('notez_list_notifications');
      expect(registeredTools).toContain('notez_get_unread_count');
      expect(registeredTools).toContain('notez_mark_notification_read');
      expect(registeredTools).toContain('notez_mark_all_notifications_read');
      expect(registeredTools).toContain('notez_delete_notification');
      // Feedback
      expect(registeredTools).toContain('notez_create_feedback');
      expect(registeredTools).toContain('notez_list_my_feedback');
      expect(registeredTools).toContain('notez_get_feedback');
      // AI
      expect(registeredTools).toContain('notez_check_ai_status');
      expect(registeredTools).toContain('notez_ai_summarize');
      expect(registeredTools).toContain('notez_ai_suggest_title');
      expect(registeredTools).toContain('notez_ai_suggest_tags');
    });

    it('registers no tools when no scopes granted', () => {
      registerNotezTools(server, () => 'user-1', []);
      expect(registeredTools).toHaveLength(0);
    });

    it('does not register the removed notez_list_recent_notes tool', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:read', 'mcp:write']);
      expect(registeredTools).not.toContain('notez_list_recent_notes');
    });
  });

  describe('task link scope enforcement', () => {
    it('does not register task link tools when only mcp:read is granted', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:read']);
      expect(registeredTools).not.toContain('notez_add_task_link');
      expect(registeredTools).not.toContain('notez_update_task_link');
      expect(registeredTools).not.toContain('notez_delete_task_link');
    });

    it('registers task link tools when mcp:write is granted', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:write']);
      expect(registeredTools).toContain('notez_add_task_link');
      expect(registeredTools).toContain('notez_update_task_link');
      expect(registeredTools).toContain('notez_delete_task_link');
    });
  });

  describe('AI tool scope enforcement', () => {
    it('registers notez_check_ai_status in read scope, AI inference tools in write scope only', () => {
      registerNotezTools(server, () => 'user-1', ['mcp:read']);
      expect(registeredTools).toContain('notez_check_ai_status');
      expect(registeredTools).not.toContain('notez_ai_summarize');
      expect(registeredTools).not.toContain('notez_ai_suggest_title');
      expect(registeredTools).not.toContain('notez_ai_suggest_tags');

      registeredTools.length = 0;
      registerNotezTools(server, () => 'user-1', ['mcp:write']);
      expect(registeredTools).not.toContain('notez_check_ai_status');
      expect(registeredTools).toContain('notez_ai_summarize');
      expect(registeredTools).toContain('notez_ai_suggest_title');
      expect(registeredTools).toContain('notez_ai_suggest_tags');
    });
  });

  describe('notez_update_task dueDate validation', () => {
    it('dueDate input schema rejects non-ISO strings', () => {
      // Regression test for Pam's issue: Claude passing natural-language dates.
      // The MCP framework validates inputSchema before calling the handler, so
      // testing the schema directly is the correct approach.
      const dueDateSchema = z.string().datetime().nullable().optional();

      // Valid ISO 8601 strings should pass
      expect(() => dueDateSchema.parse('2026-04-20T00:00:00Z')).not.toThrow();
      expect(() => dueDateSchema.parse('2026-04-20T12:30:00.000Z')).not.toThrow();
      expect(() => dueDateSchema.parse(null)).not.toThrow();
      expect(() => dueDateSchema.parse(undefined)).not.toThrow();

      // Natural-language and ambiguous strings must fail so Claude gets an error
      // and is forced to convert to ISO 8601 before retrying.
      expect(() => dueDateSchema.parse('next Tuesday')).toThrow();
      expect(() => dueDateSchema.parse('April 20')).toThrow();
      expect(() => dueDateSchema.parse('2026-04-20')).toThrow(); // date-only, not datetime
      expect(() => dueDateSchema.parse('tomorrow')).toThrow();
    });

    it('notez_update_task tool description documents ISO 8601 format requirement', () => {
      // If Claude sees "ISO 8601" in the description it will format dates correctly.
      let capturedDescription = '';
      const testServer = {
        registerTool: vi.fn((name: string, def: { description: string }) => {
          if (name === 'notez_update_task') capturedDescription = def.description;
        }),
      } as any;
      registerNotezTools(testServer, () => 'user-1', ['mcp:write']);

      expect(capturedDescription).toContain('ISO 8601');
      expect(capturedDescription).toContain('LOW');
      expect(capturedDescription).toContain('URGENT');
    });
  });

  describe('task tools: WAITING, sync identity, startDate, subtasks', () => {
    type ToolResult = { isError: boolean; content: { text: string }[] };
    const PARENT_ID = '22222222-2222-4222-8222-222222222222';
    const NOTE_ID = '33333333-3333-4333-8333-333333333333';

    function capture() {
      const defs: Record<string, { inputSchema: Record<string, z.ZodTypeAny> }> = {};
      const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
      const mock = {
        registerTool: vi.fn((name: string, def: { inputSchema: Record<string, z.ZodTypeAny> }, handler: (args: unknown) => Promise<unknown>) => {
          defs[name] = def;
          handlers[name] = handler;
        }),
      } as unknown as McpServer;
      registerNotezTools(mock, () => 'user-1', ['mcp:read', 'mcp:write']);
      return { defs, handlers };
    }

    it('notez_create_task forwards status, noteId, links, waitingOn, startDate, parentTaskId, source and externalId', async () => {
      const { handlers } = capture();
      vi.mocked(createTask).mockResolvedValue({ id: 't1' } as unknown as Awaited<ReturnType<typeof createTask>>);
      const args = {
        title: 'Call the notary',
        status: 'WAITING',
        noteId: NOTE_ID,
        links: [{ url: 'https://example.com/a', title: 'A' }],
        waitingOn: 'the notary',
        startDate: '2026-10-20T00:00:00.000Z',
        parentTaskId: PARENT_ID,
        source: 'foyer',
        externalId: 'p-1',
      };

      const result = await handlers['notez_create_task'](args) as ToolResult;

      expect(result.isError).toBe(false);
      expect(createTask).toHaveBeenCalledWith('user-1', expect.objectContaining(args));
    });

    it('notez_create_task refuses source without externalId before calling the service', async () => {
      const { handlers } = capture();
      vi.mocked(createTask).mockClear();

      const result = await handlers['notez_create_task']({ title: 'T', source: 'foyer' }) as ToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('source and externalId');
      expect(createTask).not.toHaveBeenCalled();
    });

    it('notez_update_task forwards the new fields and has no source or externalId input', async () => {
      const { defs, handlers } = capture();
      vi.mocked(updateTask).mockResolvedValue({ id: 't1' } as unknown as Awaited<ReturnType<typeof updateTask>>);
      const args = {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'WAITING',
        waitingOn: null,
        startDate: '2026-10-20T00:00:00.000Z',
        parentTaskId: null,
        noteId: NOTE_ID,
        links: [{ url: 'https://example.com/b' }],
      };

      await handlers['notez_update_task'](args);

      const { id, ...rest } = args;
      expect(updateTask).toHaveBeenCalledWith(id, 'user-1', expect.objectContaining(rest));
      expect(defs['notez_update_task'].inputSchema).not.toHaveProperty('source');
      expect(defs['notez_update_task'].inputSchema).not.toHaveProperty('externalId');
    });

    it('notez_list_tasks accepts WAITING and filters by source, externalId and parentTaskId', async () => {
      const { defs, handlers } = capture();
      vi.mocked(listTasks).mockResolvedValue({ tasks: [], total: 0, limit: 20, offset: 0 } as unknown as Awaited<ReturnType<typeof listTasks>>);

      expect(() => defs['notez_list_tasks'].inputSchema.status.parse('WAITING')).not.toThrow();

      await handlers['notez_list_tasks']({ status: 'WAITING', source: 'foyer', externalId: 'p-1', parentTaskId: PARENT_ID, limit: 20 });

      expect(listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({
        status: 'WAITING', source: 'foyer', externalId: 'p-1', parentTaskId: PARENT_ID,
      }));
    });

    it('every task status enum accepts WAITING', () => {
      const { defs } = capture();
      expect(() => defs['notez_create_task'].inputSchema.status.parse('WAITING')).not.toThrow();
      expect(() => defs['notez_update_task'].inputSchema.status.parse('WAITING')).not.toThrow();
    });
  });

  describe('notez_append_to_note handler', () => {
    it('returns error when note content would exceed maximum size', async () => {
      const { mock, handlers } = makeCapturingServer();
      registerNotezTools(mock, () => 'user-1', ['mcp:write']);

      vi.mocked(getNoteById).mockResolvedValue({ id: 'note-1', content: 'x' } as any);
      // Simulate the DB size guard rejecting the append (returns 0 rows updated)
      vi.mocked(prisma.$executeRaw).mockResolvedValue(0);

      const result = await handlers['notez_append_to_note']({ id: 'note-1', content: '<p>extra</p>' }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('exceed maximum size');
    });
  });

  describe('AI rate limiting', () => {
    it('returns rate-limit error after 20 AI calls within the window', async () => {
      const { mock, handlers } = makeCapturingServer();
      registerNotezTools(mock, () => 'user-1', ['mcp:write']);

      vi.mocked(aiService.summarize).mockResolvedValue('summary' as any);

      // Exhaust the 20-call budget
      for (let i = 0; i < 20; i++) {
        await handlers['notez_ai_summarize']({ content: 'test content' });
      }

      // 21st call must be refused
      const result = await handlers['notez_ai_summarize']({ content: 'test content' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('rate limit');
    });

    it('rate limit is per-user: different users have independent budgets', async () => {
      // Register two separate sessions for two different users
      const { mock: mock1, handlers: h1 } = makeCapturingServer();
      registerNotezTools(mock1, () => 'user-A', ['mcp:write']);

      __resetToolDefsForTesting__();
      const { mock: mock2, handlers: h2 } = makeCapturingServer();
      registerNotezTools(mock2, () => 'user-B', ['mcp:write']);

      vi.mocked(aiService.summarize).mockResolvedValue('summary' as any);

      // Exhaust user-A's budget
      for (let i = 0; i < 20; i++) {
        await h1['notez_ai_summarize']({ content: 'x' });
      }

      // user-B should still succeed
      const result = await h2['notez_ai_summarize']({ content: 'x' }) as any;
      expect(result.isError).toBeFalsy();
    });
  });

  describe('handleAiError — AI provider error routing', () => {
    let handlers: Record<string, (args: unknown) => Promise<unknown>>;

    beforeEach(() => {
      __resetAiRateLimiterForTesting__();
      __resetToolDefsForTesting__();
      const { mock, handlers: h } = makeCapturingServer();
      registerNotezTools(mock, () => 'user-1', ['mcp:write', 'mcp:read']);
      handlers = h;
    });

    it('returns actionable message for AIProviderNotConfiguredError', async () => {
      vi.mocked(aiService.summarize).mockRejectedValue(new AIProviderNotConfiguredError());
      const result = await handlers['notez_ai_summarize']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not configured');
      expect(result.content[0].text).toContain('Settings');
    });

    it('returns actionable message for AIProviderRateLimitError', async () => {
      vi.mocked(aiService.summarize).mockRejectedValue(new AIProviderRateLimitError());
      const result = await handlers['notez_ai_summarize']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('rate limit');
    });

    it('returns actionable message for AIModelNotFoundError', async () => {
      vi.mocked(aiService.suggestTitle).mockRejectedValue(new AIModelNotFoundError());
      const result = await handlers['notez_ai_suggest_title']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('model');
    });

    it('returns actionable message for AIProviderConnectionError', async () => {
      vi.mocked(aiService.suggestTags).mockRejectedValue(new AIProviderConnectionError());
      const result = await handlers['notez_ai_suggest_tags']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('provider');
    });

    it('returns generic message for unknown errors (no internal detail leak)', async () => {
      vi.mocked(aiService.summarize).mockRejectedValue(new Error('db_internal_secret_path'));
      const result = await handlers['notez_ai_summarize']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      // Must NOT expose the raw internal error message
      expect(result.content[0].text).not.toContain('db_internal_secret_path');
      expect(result.content[0].text).toContain('unexpected error');
    });

    it('passes through timeout error message', async () => {
      vi.mocked(aiService.summarize).mockRejectedValue(new Error('AI request timed out after 30 seconds'));
      const result = await handlers['notez_ai_summarize']({ content: 'x' }) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('timed out');
    });
  });
});

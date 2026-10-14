import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotezClient } from './client.js';
import type { NotezTask } from './types.js';

describe('NotezClient', () => {
  let client: NotezClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new NotezClient('https://notez.example.com', 'test-token');
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Content-Type header on DELETE requests', () => {
    it('should NOT send Content-Type header on DELETE requests (no body)', async () => {
      await client.deleteNote('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('should NOT send Content-Type header on deleteTask', async () => {
      await client.deleteTask('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on deleteFolder', async () => {
      await client.deleteFolder('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on deleteTag', async () => {
      await client.deleteTag('test-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('should NOT send Content-Type header on unshareNote', async () => {
      await client.unshareNote('note-id', 'share-id');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('Content-Type header on requests with body', () => {
    it('should send Content-Type: application/json on POST requests', async () => {
      await client.createNote({ title: 'Test' });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should send Content-Type: application/json on PATCH requests', async () => {
      await client.updateNote('test-id', { title: 'Updated' });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('tasks: WAITING, sync identity, startDate and subtasks', () => {
    const PARENT_ID = '22222222-2222-4222-8222-222222222222';
    const NOTE_ID = '33333333-3333-4333-8333-333333333333';

    function lastCall() {
      const [url, options] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
      return { url: new URL(url as string), options, body: options.body ? JSON.parse(options.body) : undefined };
    }

    it('createTask sends every new field', async () => {
      const data = {
        title: 'Call the notary',
        status: 'WAITING' as const,
        waitingOn: 'the notary',
        startDate: '2026-10-20T00:00:00.000Z',
        noteId: NOTE_ID,
        parentTaskId: PARENT_ID,
        links: [{ url: 'https://example.com', title: 'Example' }],
        source: 'foyer',
        externalId: 'p-1',
      };

      await client.createTask(data);

      const { url, options, body } = lastCall();
      expect(url.pathname).toBe('/api/mcp/tasks');
      expect(options.method).toBe('POST');
      expect(body).toEqual(data);
    });

    it('updateTask sends the new fields and null to clear them', async () => {
      await client.updateTask('task-1', {
        status: 'WAITING',
        waitingOn: null,
        startDate: null,
        parentTaskId: null,
        noteId: null,
        links: [{ url: 'https://example.com/b' }],
      });

      const { url, body } = lastCall();
      expect(url.pathname).toBe('/api/mcp/tasks/task-1');
      expect(body).toEqual({
        status: 'WAITING', waitingOn: null, startDate: null, parentTaskId: null, noteId: null,
        links: [{ url: 'https://example.com/b' }],
      });
    });

    it('listTasks sends a status list, filters, sort and paging', async () => {
      await client.listTasks({
        status: ['PENDING', 'IN_PROGRESS', 'WAITING'],
        source: 'foyer',
        externalId: 'p-1',
        parentTaskId: PARENT_ID,
        sortBy: 'startDate',
        sortOrder: 'asc',
        limit: 100,
        offset: 100,
      });

      const { url } = lastCall();
      expect(url.pathname).toBe('/api/mcp/tasks');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        status: 'PENDING,IN_PROGRESS,WAITING',
        source: 'foyer',
        externalId: 'p-1',
        parentTaskId: PARENT_ID,
        sortBy: 'startDate',
        sortOrder: 'asc',
        limit: '100',
        offset: '100',
      });
    });

    it('listTasks keeps the old (status, limit) call working', async () => {
      await client.listTasks('WAITING', 5);

      const { url } = lastCall();
      expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'WAITING', limit: '5' });
    });

    it('getTaskByExternalId calls by-external-id with both parameters', async () => {
      await client.getTaskByExternalId('foyer', 'p 1');

      const { url, options } = lastCall();
      expect(url.pathname).toBe('/api/mcp/tasks/by-external-id');
      expect(Object.fromEntries(url.searchParams)).toEqual({ source: 'foyer', externalId: 'p 1' });
      expect(options.method).toBeUndefined();
    });

    it('NotezTask types the new fields', () => {
      // Compile-time check (tsc covers test files); the runtime assertion keeps vitest honest
      const task: NotezTask = {
        id: 't1', title: 'T', description: null, status: 'WAITING', priority: 'LOW',
        dueDate: null, startDate: '2026-10-20T00:00:00.000Z', waitingOn: 'Bob',
        source: 'foyer', externalId: 'p-1', parentTaskId: null,
        noteId: null, noteTitle: null, folderId: null,
        createdAt: '', updatedAt: '', completedAt: null,
        tags: [], links: [{ id: 'l1', url: 'https://example.com', title: null, createdAt: '' }],
        parent: null, subtasks: [{ id: 's1', title: 'S', status: 'PENDING', dueDate: null }],
      };
      expect(task.status).toBe('WAITING');
    });
  });

  describe('Content-Type header on GET requests', () => {
    it('should NOT send Content-Type header on GET requests (no body)', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await client.listFolders();

      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';

// Token auth has its own tests; here a request is either a read+write token or nothing
vi.mock('../middleware/auth.middleware.js', () => ({
  authenticateApiToken: async (request: any, reply: any) => {
    if (request.headers.authorization !== 'Bearer ntez_test') {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid API token' });
    }
    request.user = { userId: 'user-1', username: 'adam', role: 'user' };
    request.apiTokenId = 'token-1';
    request.apiTokenScopes = ['read', 'write'];
  },
  requireScope: () => async () => {},
}));

vi.mock('../services/task.service.js', () => ({
  getTaskById: vi.fn(),
  getTaskByExternalId: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock('../services/search.service.js', () => ({ searchService: { searchNotes: vi.fn() } }));
vi.mock('../services/note.service.js', () => ({
  getNoteById: vi.fn(), getNoteByTitle: vi.fn(), listNotes: vi.fn(), createNote: vi.fn(),
  updateNote: vi.fn(), deleteNote: vi.fn(), restoreNote: vi.fn(),
}));
vi.mock('../services/folder.service.js', () => ({
  listFolders: vi.fn(), createFolder: vi.fn(), updateFolder: vi.fn(), deleteFolder: vi.fn(),
}));
vi.mock('../services/tag.service.js', () => ({ listTags: vi.fn(), renameTag: vi.fn(), deleteTag: vi.fn() }));
vi.mock('../services/share.service.js', () => ({
  shareNote: vi.fn(), listSharesForNote: vi.fn(), unshareNote: vi.fn(), updateSharePermission: vi.fn(),
}));
vi.mock('../services/token.service.js', () => ({ hashToken: (t: string) => `hash-${t}` }));

import { mcpRoutes } from './mcp.routes.js';
import { healthRoutes } from './health.routes.js';
import * as taskService from '../services/task.service.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const mockTasks = vi.mocked(taskService);
const AUTH = { authorization: 'Bearer ntez_test' };
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';

describe('external API (mcp.routes) tasks', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTasks.listTasks.mockResolvedValue({ tasks: [], total: 0, limit: 20, offset: 0 } as any);
    app = Fastify();
    await app.register(mcpRoutes, { prefix: '/api/v1' });
    await app.register(mcpRoutes, { prefix: '/api/mcp' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /tasks ─────────────────────────────────────────────────────
  it('accepts a comma-separated status list including WAITING', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks?status=PENDING,IN_PROGRESS,WAITING', headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(mockTasks.listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({
      status: ['PENDING', 'IN_PROGRESS', 'WAITING'],
    }));
  });

  it('keeps a single status as a single value', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/tasks?status=WAITING', headers: AUTH });

    expect(mockTasks.listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'WAITING' }));
  });

  it('refuses an unknown status in the list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks?status=PENDING,DONE', headers: AUTH });
    expect(res.statusCode).toBe(400);
  });

  it('passes sortBy, sortOrder, offset, limit up to 100 and the new filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tasks?sortBy=startDate&sortOrder=asc&offset=40&limit=100&source=foyer&externalId=p-1&parentTaskId=${PARENT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(mockTasks.listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({
      sortBy: 'startDate',
      sortOrder: 'asc',
      offset: 40,
      limit: 100,
      source: 'foyer',
      externalId: 'p-1',
      parentTaskId: PARENT_ID,
    }));
  });

  it('keeps the old defaults: limit 20, offset 0, priority desc', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/tasks', headers: AUTH });

    expect(mockTasks.listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({
      limit: 20, offset: 0, sortBy: 'priority', sortOrder: 'desc',
    }));
  });

  it('refuses limit 101', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks?limit=101', headers: AUTH });
    expect(res.statusCode).toBe(400);
  });

  it('refuses externalId without source', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks?externalId=p-1', headers: AUTH });
    expect(res.statusCode).toBe(400);
  });

  // ─── GET /tasks/by-external-id ──────────────────────────────────────
  // Documents behaviour, it cannot catch a regression on its own: find-my-way always
  // prefers the static segment "by-external-id" over ":id", whatever the registration order.
  // (":id" also requires a UUID, so the old router would have answered 400, not 200.)
  it('routes /tasks/by-external-id to the by-external-id handler, not /tasks/:id', async () => {
    mockTasks.getTaskByExternalId.mockResolvedValue({ id: TASK_ID, source: 'foyer', externalId: 'p-1' } as any);

    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/by-external-id?source=foyer&externalId=p-1', headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(TASK_ID);
    expect(mockTasks.getTaskByExternalId).toHaveBeenCalledWith('user-1', 'foyer', 'p-1');
    expect(mockTasks.getTaskById).not.toHaveBeenCalled();
  });

  it('answers 404 when no task has that source and externalId', async () => {
    mockTasks.getTaskByExternalId.mockRejectedValue(new NotFoundError('Task not found'));

    const res = await app.inject({ method: 'GET', url: '/api/mcp/tasks/by-external-id?source=foyer&externalId=nope', headers: AUTH });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: 'Task not found' });
  });

  it('requires both source and externalId on by-external-id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/by-external-id?source=foyer', headers: AUTH });
    expect(res.statusCode).toBe(400);
  });

  // ─── POST /tasks ────────────────────────────────────────────────────
  it('creates a task with every new field and answers 201', async () => {
    mockTasks.createTask.mockResolvedValue({ id: TASK_ID, status: 'WAITING', source: 'foyer', externalId: 'p-1' } as any);
    const body = {
      title: 'Call the notary',
      description: 'quote',
      status: 'WAITING',
      priority: 'HIGH',
      dueDate: '2026-10-21T00:00:00.000Z',
      startDate: '2026-10-20T00:00:00.000Z',
      noteId: NOTE_ID,
      parentTaskId: PARENT_ID,
      waitingOn: 'the notary',
      source: 'foyer',
      externalId: 'p-1',
      links: [{ url: 'https://foyer.cogg.haus/captures/c1#proposal-p-1', title: 'Open in Foyer' }],
    };

    const res = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: AUTH, payload: body });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: TASK_ID, status: 'WAITING', source: 'foyer', externalId: 'p-1' });
    expect(mockTasks.createTask).toHaveBeenCalledWith('user-1', expect.objectContaining(body), 'token-1');
  });

  it('answers 409 on a duplicate source and externalId', async () => {
    mockTasks.createTask.mockRejectedValue(new ConflictError('A task with this source and externalId already exists'));

    const res = await app.inject({
      method: 'POST', url: '/api/v1/tasks', headers: AUTH,
      payload: { title: 'T', source: 'foyer', externalId: 'p-1' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'ConflictError', message: 'A task with this source and externalId already exists' });
  });

  it('refuses source without externalId and non-http links', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: AUTH, payload: { title: 'T', source: 'foyer' } });
    const b = await app.inject({
      method: 'POST', url: '/api/v1/tasks', headers: AUTH,
      payload: { title: 'T', links: [{ url: 'javascript:alert(1)' }] },
    });
    expect(a.statusCode).toBe(400);
    expect(b.statusCode).toBe(400);
    expect(mockTasks.createTask).not.toHaveBeenCalled();
  });

  // ─── PATCH /tasks/:id and /status ───────────────────────────────────
  it('updates the new fields, clearing with null', async () => {
    mockTasks.updateTask.mockResolvedValue({ id: TASK_ID } as any);
    const body = {
      startDate: null,
      waitingOn: null,
      parentTaskId: null,
      noteId: null,
      status: 'WAITING',
      links: [{ url: 'https://example.com' }],
    };

    const res = await app.inject({ method: 'PATCH', url: `/api/v1/tasks/${TASK_ID}`, headers: AUTH, payload: body });

    expect(res.statusCode).toBe(200);
    expect(mockTasks.updateTask).toHaveBeenCalledWith(TASK_ID, 'user-1', expect.objectContaining(body), 'token-1');
  });

  it('refuses source and externalId on update', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/tasks/${TASK_ID}`, headers: AUTH,
      payload: { title: 'T', source: 'foyer', externalId: 'p-2' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockTasks.updateTask).not.toHaveBeenCalled();
  });

  it('accepts WAITING on the status route', async () => {
    mockTasks.updateTaskStatus.mockResolvedValue({ id: TASK_ID, status: 'WAITING' } as any);

    const res = await app.inject({ method: 'PATCH', url: `/api/v1/tasks/${TASK_ID}/status`, headers: AUTH, payload: { status: 'WAITING' } });

    expect(res.statusCode).toBe(200);
    expect(mockTasks.updateTaskStatus).toHaveBeenCalledWith(TASK_ID, 'user-1', 'WAITING');
  });
});

describe('/health', () => {
  const pkgVersion = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
  ).version as string;

  it('carries the backend version when the database is up', async () => {
    const app = Fastify();
    await app.register(healthRoutes, { checkDatabase: async () => undefined });
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'connected', version: pkgVersion });
  });

  it('still answers 503 when the database is down', async () => {
    const app = Fastify();
    await app.register(healthRoutes, { checkDatabase: async () => { throw new Error('down'); } });
    const res = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'error', database: 'disconnected' });
  });
});

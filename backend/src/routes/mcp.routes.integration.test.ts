import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// The external API with the REAL auth middleware (authenticateApiToken + requireScope)
// and the REAL task service. Only the token lookup and Prisma are faked, so these tests
// prove the per-route scope binding and what the service writes for a route call.

const tx = {
  folder: { findFirst: vi.fn() },
  note: { findFirst: vi.fn() },
  tag: { upsert: vi.fn() },
  task: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  taskTag: { deleteMany: vi.fn(), createMany: vi.fn() },
  taskLink: { deleteMany: vi.fn(), createMany: vi.fn() },
  $queryRaw: vi.fn(),
};

vi.mock('../lib/db.js', () => ({
  prisma: {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Token lookup: ntez_read has only "read", ntez_write has "read" and "write"
vi.mock('../services/token.service.js', () => ({
  hashToken: (t: string) => `hash-${t}`,
  validateApiToken: vi.fn(async (raw: string) => {
    if (raw === 'ntez_read') return { tokenId: 'tok-r', userId: 'user-1', username: 'adam', role: 'user', scopes: ['read'] };
    if (raw === 'ntez_write') return { tokenId: 'tok-w', userId: 'user-1', username: 'adam', role: 'user', scopes: ['read', 'write'] };
    throw new Error('Invalid token');
  }),
}));

// Non-task services are not under test here
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

import { mcpRoutes } from './mcp.routes.js';
import { prisma } from '../lib/db.js';

const mockPrisma = vi.mocked(prisma);
const READ = { authorization: 'Bearer ntez_read' };
const WRITE = { authorization: 'Bearer ntez_write' };
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const stored = { id: TASK_ID, userId: 'user-1', title: 'T', status: 'PENDING', tags: [], links: [] };

describe('external API with real scope checks and the real task service', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((async (fn: (client: typeof tx) => unknown) => fn(tx)) as never);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.count.mockResolvedValue(0);
    mockPrisma.task.findFirst.mockResolvedValue(stored as unknown as Awaited<ReturnType<typeof prisma.task.findFirst>>);
    tx.task.create.mockResolvedValue(stored);
    app = Fastify();
    await app.register(mcpRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── Scope binding ──────────────────────────────────────────────────
  it.each([
    ['POST', '/api/v1/tasks', { title: 'T' }],
    ['PATCH', `/api/v1/tasks/${TASK_ID}`, { title: 'T2' }],
    ['PATCH', `/api/v1/tasks/${TASK_ID}/status`, { status: 'WAITING' }],
    ['DELETE', `/api/v1/tasks/${TASK_ID}`, undefined],
  ] as const)('a read-only token gets 403 on %s %s', async (method, url, payload) => {
    const res = await app.inject({ method, url, headers: READ, ...(payload ? { payload } : {}) });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden', message: 'Missing required scope: write' });
    expect(tx.task.create).not.toHaveBeenCalled();
    expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
  });

  it('a read-only token can list tasks', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks?status=PENDING,WAITING', headers: READ });
    expect(res.statusCode).toBe(200);
  });

  it('a read-only token can get a task by external id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks/by-external-id?source=foyer&externalId=p-1', headers: READ });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', source: 'foyer', externalId: 'p-1' } })
    );
  });

  it('a write token passes the scope check on create (positive control)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tasks', headers: WRITE, payload: { title: 'T' } });
    expect(res.statusCode).toBe(201);
  });

  it('no token gets 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(res.statusCode).toBe(401);
  });

  // ─── completedAt through the route ──────────────────────────────────
  it('a task created as COMPLETED through POST /tasks gets completedAt', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/tasks', headers: WRITE,
      payload: { title: 'Already done', status: 'COMPLETED' },
    });

    expect(res.statusCode).toBe(201);
    const data = tx.task.create.mock.calls[0][0].data;
    expect(data.status).toBe('COMPLETED');
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  // ─── offset cap ─────────────────────────────────────────────────────
  it('refuses an offset above 100000 and accepts 100000', async () => {
    const over = await app.inject({ method: 'GET', url: '/api/v1/tasks?offset=100001', headers: READ });
    const at = await app.inject({ method: 'GET', url: '/api/v1/tasks?offset=100000', headers: READ });

    expect(over.statusCode).toBe(400);
    expect(at.statusCode).toBe(200);
  });
});

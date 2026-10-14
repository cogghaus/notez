import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Transaction client handed to prisma.$transaction(fn) callbacks
const tx = {
  folder: { findFirst: vi.fn() },
  note: { findFirst: vi.fn() },
  tag: { upsert: vi.fn() },
  taskTag: { deleteMany: vi.fn(), createMany: vi.fn() },
  taskLink: { deleteMany: vi.fn(), createMany: vi.fn() },
  task: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
};

vi.mock('../lib/db.js', () => ({
  prisma: {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  createTask,
  updateTask,
  listTasks,
  getTaskById,
  getTaskByExternalId,
  getTaskStats,
} from './task.service.js';
import { prisma } from '../lib/db.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';

/** Shape of the findMany or findFirst args the tests inspect */
interface CapturedArgs {
  where: Record<string, unknown>;
  orderBy: unknown[];
  include: Record<string, unknown>;
}


const mockPrisma = vi.mocked(prisma);

const USER = 'user-1';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';

function savedTask(overrides: Record<string, unknown> = {}) {
  return { id: TASK_ID, userId: USER, title: 'T', tags: [], links: [], ...overrides };
}

function p2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { modelName: 'Task', target },
  });
}

describe('task.service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Interactive transactions run the callback against tx; array transactions resolve each promise
    mockPrisma.$transaction.mockImplementation((async (arg: ((client: typeof tx) => unknown) | Promise<unknown>[]) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg)) as never
    );
    tx.$queryRaw.mockResolvedValue([]);
    tx.task.create.mockResolvedValue(savedTask());
    tx.task.update.mockResolvedValue(savedTask());
    tx.task.count.mockResolvedValue(0);
  });

  // ─── createTask ───────────────────────────────────────────────────────
  describe('createTask', () => {
    it('passes waitingOn, source, externalId, startDate and parentTaskId through', async () => {
      tx.task.findFirst.mockResolvedValue({ id: PARENT_ID, parentTaskId: null });

      await createTask(USER, {
        title: 'T',
        status: 'WAITING',
        waitingOn: 'the notary',
        source: 'foyer',
        externalId: 'proposal-1',
        startDate: '2026-10-20T00:00:00.000Z',
        parentTaskId: PARENT_ID,
      });

      const data = tx.task.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'WAITING',
        waitingOn: 'the notary',
        source: 'foyer',
        externalId: 'proposal-1',
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        parentTaskId: PARENT_ID,
      });
    });

    it('sets completedAt when a task is created as COMPLETED', async () => {
      const before = Date.now();
      await createTask(USER, { title: 'T', status: 'COMPLETED' });

      const data = tx.task.create.mock.calls[0][0].data;
      expect(data.completedAt).toBeInstanceOf(Date);
      expect((data.completedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('leaves completedAt null for any other initial status', async () => {
      for (const status of ['PENDING', 'IN_PROGRESS', 'WAITING', 'CANCELLED'] as const) {
        tx.task.create.mockClear();
        await createTask(USER, { title: 'T', status });
        expect(tx.task.create.mock.calls[0][0].data.completedAt).toBeNull();
      }
      tx.task.create.mockClear();
      await createTask(USER, { title: 'T' });
      expect(tx.task.create.mock.calls[0][0].data.completedAt).toBeNull();
    });

    it('writes nulls for the new fields when they are absent', async () => {
      await createTask(USER, { title: 'T' });

      const data = tx.task.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ waitingOn: null, source: null, externalId: null, startDate: null, parentTaskId: null });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('maps a P2002 on (user_id, source, external_id) to ConflictError', async () => {
      tx.task.create.mockRejectedValue(p2002(['user_id', 'source', 'external_id']));

      const promise = createTask(USER, { title: 'T', source: 'foyer', externalId: 'proposal-1' });
      await expect(promise).rejects.toThrow(ConflictError);
      await expect(createTask(USER, { title: 'T', source: 'foyer', externalId: 'proposal-1' }))
        .rejects.toThrow('A task with this source and externalId already exists');
    });

    it('does not map other unique violations (duplicate tag) to ConflictError', async () => {
      const original = p2002(['task_id', 'tag_id']);
      tx.task.create.mockRejectedValue(original);

      await expect(createTask(USER, { title: 'T' })).rejects.toBe(original);
    });

    it('refuses a parent the user does not own with NotFoundError', async () => {
      tx.task.findFirst.mockResolvedValue(null);

      await expect(createTask(USER, { title: 'T', parentTaskId: PARENT_ID })).rejects.toThrow(NotFoundError);
      await expect(createTask(USER, { title: 'T', parentTaskId: PARENT_ID })).rejects.toThrow('Parent task not found');
      expect(tx.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PARENT_ID, userId: USER } })
      );
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('refuses a parent that is itself a subtask with BadRequestError', async () => {
      tx.task.findFirst.mockResolvedValue({ id: PARENT_ID, parentTaskId: 'grandparent' });

      await expect(createTask(USER, { title: 'T', parentTaskId: PARENT_ID })).rejects.toThrow(BadRequestError);
      await expect(createTask(USER, { title: 'T', parentTaskId: PARENT_ID })).rejects.toThrow('Subtasks cannot have subtasks');
    });

    it('locks the parent row before checking it', async () => {
      tx.task.findFirst.mockResolvedValue({ id: PARENT_ID, parentTaskId: null });

      await createTask(USER, { title: 'T', parentTaskId: PARENT_ID });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.sql).toContain('FOR UPDATE');
      expect(sql.values).toEqual([PARENT_ID]);
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.task.findFirst.mock.invocationCallOrder[0]);
    });
  });

  // ─── updateTask ───────────────────────────────────────────────────────
  describe('updateTask', () => {
    beforeEach(() => {
      // First findFirst: the task being updated
      tx.task.findFirst.mockResolvedValueOnce({ id: TASK_ID, userId: USER, parentTaskId: null, completedAt: null });
    });

    it('writes waitingOn, startDate and parentTaskId', async () => {
      tx.task.findFirst.mockResolvedValueOnce({ id: PARENT_ID, parentTaskId: null });

      await updateTask(TASK_ID, USER, {
        waitingOn: 'Bob',
        startDate: '2026-11-01T00:00:00.000Z',
        parentTaskId: PARENT_ID,
      });

      const data = tx.task.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        waitingOn: 'Bob',
        startDate: new Date('2026-11-01T00:00:00.000Z'),
        parentTaskId: PARENT_ID,
      });
    });

    it('clears startDate, waitingOn and parentTaskId with null', async () => {
      await updateTask(TASK_ID, USER, { startDate: null, waitingOn: null, parentTaskId: null });

      const data = tx.task.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ startDate: null, waitingOn: null, parentTaskId: null });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('leaves waitingOn alone on a status change', async () => {
      await updateTask(TASK_ID, USER, { status: 'IN_PROGRESS' });

      const data = tx.task.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('waitingOn');
    });

    it('refuses a task as its own parent', async () => {
      await expect(updateTask(TASK_ID, USER, { parentTaskId: TASK_ID })).rejects.toThrow(BadRequestError);
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('refuses a parent the user does not own', async () => {
      tx.task.findFirst.mockResolvedValueOnce(null);

      await expect(updateTask(TASK_ID, USER, { parentTaskId: PARENT_ID })).rejects.toThrow('Parent task not found');
    });

    it('refuses a parent that is itself a subtask', async () => {
      tx.task.findFirst.mockResolvedValueOnce({ id: PARENT_ID, parentTaskId: 'grandparent' });

      await expect(updateTask(TASK_ID, USER, { parentTaskId: PARENT_ID })).rejects.toThrow('Subtasks cannot have subtasks');
    });

    it('refuses a parent for a task that has subtasks', async () => {
      tx.task.findFirst.mockResolvedValueOnce({ id: PARENT_ID, parentTaskId: null });
      tx.task.count.mockResolvedValue(2);

      await expect(updateTask(TASK_ID, USER, { parentTaskId: PARENT_ID })).rejects.toThrow(BadRequestError);
      expect(tx.task.count).toHaveBeenCalledWith({ where: { parentTaskId: TASK_ID } });
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('locks both rows in id order before the parent checks', async () => {
      tx.task.findFirst.mockResolvedValueOnce({ id: PARENT_ID, parentTaskId: null });

      await updateTask(TASK_ID, USER, { parentTaskId: PARENT_ID });

      const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.sql).toContain('FOR UPDATE');
      expect(sql.values).toEqual([TASK_ID, PARENT_ID].sort());
    });
  });

  // ─── reads ────────────────────────────────────────────────────────────
  describe('listTasks', () => {
    beforeEach(() => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.count.mockResolvedValue(0);
    });

    it('filters by source + externalId and parentTaskId', async () => {
      await listTasks(USER, { source: 'foyer', externalId: 'proposal-1', parentTaskId: PARENT_ID });

      const args = mockPrisma.task.findMany.mock.calls[0][0] as unknown as CapturedArgs;
      expect(args.where).toMatchObject({ userId: USER, source: 'foyer', externalId: 'proposal-1', parentTaskId: PARENT_ID });
    });

    it('filters by a status list including WAITING', async () => {
      await listTasks(USER, { status: ['PENDING', 'IN_PROGRESS', 'WAITING'] });

      const args = mockPrisma.task.findMany.mock.calls[0][0] as unknown as CapturedArgs;
      expect(args.where.status).toEqual({ in: ['PENDING', 'IN_PROGRESS', 'WAITING'] });
    });

    it('sorts by startDate with nulls last when ascending', async () => {
      await listTasks(USER, { sortBy: 'startDate', sortOrder: 'asc' });

      const args = mockPrisma.task.findMany.mock.calls[0][0] as unknown as CapturedArgs;
      expect(args.orderBy[0]).toEqual({ startDate: { sort: 'asc', nulls: 'last' } });
    });

    it('includes the parent (id, title) on each task', async () => {
      await listTasks(USER);

      const args = mockPrisma.task.findMany.mock.calls[0][0] as unknown as CapturedArgs;
      expect(args.include.parent).toEqual({ select: { id: true, title: true } });
    });
  });

  describe('getTaskById', () => {
    it('includes parent and subtasks ordered by createdAt', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(savedTask({ parent: null, subtasks: [] }) as unknown as Awaited<ReturnType<typeof prisma.task.findFirst>>);

      await getTaskById(TASK_ID, USER);

      const args = mockPrisma.task.findFirst.mock.calls[0][0] as unknown as CapturedArgs;
      expect(args.include.parent).toEqual({ select: { id: true, title: true } });
      expect(args.include.subtasks).toEqual({
        select: { id: true, title: true, status: true, dueDate: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('getTaskByExternalId', () => {
    it('throws NotFoundError on a miss', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(getTaskByExternalId(USER, 'foyer', 'nope')).rejects.toThrow(NotFoundError);
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER, source: 'foyer', externalId: 'nope' } })
      );
    });

    it('returns the task with flattened tags on a hit', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(
        savedTask({ source: 'foyer', externalId: 'p-1', tags: [{ tag: { id: 't1', name: 'memo' } }] }) as unknown as Awaited<ReturnType<typeof prisma.task.findFirst>>
      );

      const task = await getTaskByExternalId(USER, 'foyer', 'p-1');
      expect(task.id).toBe(TASK_ID);
      expect(task.tags).toEqual([{ id: 't1', name: 'memo' }]);
    });
  });

  describe('getTaskStats', () => {
    it('returns waitingTasks', async () => {
      mockPrisma.task.count.mockImplementation((async (args?: { where?: { status?: string } }) =>
        args?.where?.status === 'WAITING' ? 3 : 1) as never);

      const stats = await getTaskStats(USER);

      expect(stats.waitingTasks).toBe(3);
      expect(mockPrisma.task.count).toHaveBeenCalledWith({ where: { userId: USER, status: 'WAITING' } });
    });
  });
});

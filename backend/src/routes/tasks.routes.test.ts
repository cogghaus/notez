import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../middleware/auth.middleware.js', () => ({
  authenticateToken: async (request: any) => {
    request.user = { userId: 'user-1', username: 'adam', role: 'user' };
  },
}));
vi.mock('../services/task.service.js', () => ({
  listTasks: vi.fn(),
  getTaskStats: vi.fn(),
  getTaskById: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteTask: vi.fn(),
  addTaskLink: vi.fn(),
  updateTaskLink: vi.fn(),
  deleteTaskLink: vi.fn(),
}));
vi.mock('../services/task-extraction.service.js', () => ({
  scanNotesForTasks: vi.fn(),
  importTasksFromNotes: vi.fn(),
}));
vi.mock('../services/webhook.service.js', () => ({ safeEmitWebhookEvent: vi.fn() }));

import { tasksRoutes } from './tasks.routes.js';
import * as taskService from '../services/task.service.js';
import { ConflictError, BadRequestError, NotFoundError } from '../utils/errors.js';

const mockTasks = vi.mocked(taskService);
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';

describe('session task routes: typed service errors', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(tasksRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('create answers 409 for a duplicate source and externalId', async () => {
    mockTasks.createTask.mockRejectedValue(new ConflictError('A task with this source and externalId already exists'));

    const res = await app.inject({
      method: 'POST', url: '/api/tasks',
      payload: { title: 'T', source: 'foyer', externalId: 'p-1' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toBe('A task with this source and externalId already exists');
  });

  it('create answers 404 for a parent the user does not own', async () => {
    mockTasks.createTask.mockRejectedValue(new NotFoundError('Parent task not found'));

    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'T', parentTaskId: PARENT_ID } });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Parent task not found');
  });

  it('update answers 400 when the parent is itself a subtask', async () => {
    mockTasks.updateTask.mockRejectedValue(new BadRequestError('Subtasks cannot have subtasks'));

    const res = await app.inject({ method: 'PUT', url: `/api/tasks/${TASK_ID}`, payload: { parentTaskId: PARENT_ID } });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe('Subtasks cannot have subtasks');
  });

  it('list passes the source, externalId and parentTaskId filters', async () => {
    mockTasks.listTasks.mockResolvedValue({ tasks: [], total: 0, limit: 50, offset: 0 } as any);

    await app.inject({ method: 'GET', url: `/api/tasks?source=foyer&externalId=p-1&parentTaskId=${PARENT_ID}` });

    expect(mockTasks.listTasks).toHaveBeenCalledWith('user-1', expect.objectContaining({
      source: 'foyer', externalId: 'p-1', parentTaskId: PARENT_ID,
    }));
  });
});

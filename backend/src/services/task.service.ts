import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import type { CreateTaskInput, UpdateTaskInput, TaskSortField } from '../utils/validation.schemas.js';

/** Selected for the parent of a task (list and detail) */
const parentSelect = { select: { id: true, title: true } } as const;

/** Selected for the subtasks of a task (detail only) */
const subtasksSelect = {
  select: { id: true, title: true, status: true, dueDate: true },
  orderBy: { createdAt: 'asc' },
} as const;

/** Relations returned with a single task */
const taskDetailInclude = {
  folder: { select: { id: true, name: true } },
  note: { select: { id: true, title: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  links: {
    select: { id: true, url: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
  parent: parentSelect,
  subtasks: subtasksSelect,
} as const;

/**
 * True when a Prisma error is the (user_id, source, external_id) unique index.
 * Other unique violations (e.g. the same tag twice, which hits task_tags' key)
 * also surface as P2002 on Task, so the target columns are checked.
 */
function isSyncIdentityConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes('external_id') || target.includes('externalId');
  return typeof target === 'string' && target.includes('external_id');
}

/**
 * Lock task rows for the rest of the transaction, always in id order so two
 * concurrent re-parentings cannot deadlock. With the rows locked, the one-level
 * checks below see committed state, so two concurrent updates cannot build a
 * two-level chain or a cycle (A under B while B goes under A).
 */
async function lockTaskRows(tx: Prisma.TransactionClient, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM tasks WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`
  );
}

/**
 * Check that parentTaskId can be the parent of a task: owned by the user and
 * not itself a subtask (subtasks are one level deep).
 */
async function assertValidParent(tx: Prisma.TransactionClient, userId: string, parentTaskId: string) {
  const parent = await tx.task.findFirst({
    where: { id: parentTaskId, userId },
    select: { id: true, parentTaskId: true },
  });
  if (!parent) {
    throw new NotFoundError('Parent task not found');
  }
  if (parent.parentTaskId) {
    throw new BadRequestError('Subtasks cannot have subtasks');
  }
}

/**
 * Build orderBy array for task queries based on sort options
 */
function buildTaskOrderBy(sortBy: string, sortOrder: 'asc' | 'desc'): any[] {
  const orderBy: any[] = [];

  // Primary sort based on user selection
  switch (sortBy) {
    case 'priority':
      // Priority: URGENT > HIGH > MEDIUM > LOW (desc = urgent first)
      orderBy.push({ priority: sortOrder });
      orderBy.push({ dueDate: 'asc' }); // Secondary: earliest due date
      break;
    case 'dueDate':
      // Due date: nulls last for asc, nulls first for desc
      orderBy.push({ dueDate: { sort: sortOrder, nulls: sortOrder === 'asc' ? 'last' : 'first' } });
      orderBy.push({ priority: 'desc' }); // Secondary: highest priority
      break;
    case 'createdAt':
      orderBy.push({ createdAt: sortOrder });
      break;
    case 'title':
      orderBy.push({ title: sortOrder });
      break;
    case 'startDate':
      // Start date: nulls last for asc, nulls first for desc (same as dueDate)
      orderBy.push({ startDate: { sort: sortOrder, nulls: sortOrder === 'asc' ? 'last' : 'first' } });
      orderBy.push({ priority: 'desc' });
      break;
    default:
      // Default: priority desc, then due date asc
      orderBy.push({ priority: 'desc' });
      orderBy.push({ dueDate: 'asc' });
  }

  // Always add createdAt as final tiebreaker
  if (sortBy !== 'createdAt') {
    orderBy.push({ createdAt: 'desc' });
  }

  return orderBy;
}

/**
 * Get task by ID
 * Only returns the task if it belongs to the requesting user
 */
export async function getTaskById(taskId: string, userId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
    },
    include: taskDetailInclude,
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Transform tags to simpler format
  return {
    ...task,
    tags: task.tags.map((tt: any) => tt.tag),
  };
}

/**
 * Get a task by its sync identity (source + externalId), unique per user.
 * Lets a client that timed out after Notez committed find the task it created.
 */
export async function getTaskByExternalId(userId: string, source: string, externalId: string) {
  const task = await prisma.task.findFirst({
    where: { userId, source, externalId },
    include: taskDetailInclude,
  });

  if (!task) {
    throw new NotFoundError('Task not found');
  }

  return {
    ...task,
    tags: task.tags.map((tt) => tt.tag),
  };
}

/**
 * List all tasks for a user
 * Supports filtering by status, priority, folder, note, tag, and due date
 */
export async function listTasks(
  userId: string,
  options?: {
    status?: string | string[];
    priority?: string;
    folderId?: string;
    noteId?: string;
    tagId?: string;
    source?: string;
    externalId?: string;
    parentTaskId?: string;
    overdue?: boolean;
    createdByTokenId?: string;
    agentCreated?: boolean;
    sortBy?: TaskSortField;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
) {
  const { status, priority, folderId, noteId, tagId, source, externalId, parentTaskId, overdue, createdByTokenId, agentCreated, sortBy = 'priority', sortOrder = 'desc', limit = 50, offset = 0 } = options || {};

  // Build where clause
  const where: any = { userId };

  // Filter by status (can be single or array)
  if (status) {
    if (Array.isArray(status)) {
      where.status = { in: status };
    } else {
      where.status = status;
    }
  }

  // Filter by priority
  if (priority) {
    where.priority = priority;
  }

  // Filter by folder
  if (folderId !== undefined) {
    where.folderId = folderId;
  }

  // Filter by note
  if (noteId !== undefined) {
    where.noteId = noteId;
  }

  // Filter by tag
  if (tagId) {
    where.tags = {
      some: {
        tagId,
      },
    };
  }

  // Filter by sync identity (externalId is only meaningful with a source)
  if (source) {
    where.source = source;
  }
  if (externalId) {
    where.externalId = externalId;
  }

  // Filter by parent (the subtasks of one task)
  if (parentTaskId) {
    where.parentTaskId = parentTaskId;
  }

  // Filter by specific agent token
  if (createdByTokenId) {
    where.createdByTokenId = createdByTokenId;
  }

  // Filter by any agent-created content
  if (agentCreated !== undefined) {
    if (agentCreated) {
      where.createdByToken = { isAgent: true };
    } else {
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          { createdByTokenId: null },
          { createdByToken: { isAgent: false } },
        ],
      });
    }
  }

  // Filter by overdue tasks
  if (overdue) {
    where.dueDate = {
      lt: new Date(),
    };
    where.status = {
      notIn: ['COMPLETED', 'CANCELLED'],
    };
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        note: {
          select: {
            id: true,
            title: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        links: {
          select: {
            id: true,
            url: true,
            title: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        parent: parentSelect,
      },
      orderBy: buildTaskOrderBy(sortBy, sortOrder),
      take: limit,
      skip: offset,
    }),
    prisma.task.count({ where }),
  ]);

  // Transform tags to simpler format
  const transformedTasks = tasks.map((task: any) => ({
    ...task,
    tags: task.tags.map((tt: any) => tt.tag),
  }));

  return {
    tasks: transformedTasks,
    total,
    limit,
    offset,
  };
}

/**
 * Create a new task
 *
 * A duplicate (source, externalId) for the user becomes ConflictError (409),
 * so a client retrying a create it cannot confirm gets "already there"
 * instead of a second task.
 */
export async function createTask(userId: string, data: CreateTaskInput, createdByTokenId?: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      // If folderId is provided, verify it belongs to the user
      if (data.folderId) {
        const folder = await tx.folder.findFirst({
          where: {
            id: data.folderId,
            userId,
          },
        });

        if (!folder) {
          throw new Error('Folder not found');
        }
      }

      // If noteId is provided, verify it belongs to the user
      let noteTitle: string | undefined;
      if (data.noteId) {
        const note = await tx.note.findFirst({
          where: {
            id: data.noteId,
            userId,
          },
        });

        if (!note) {
          throw new Error('Note not found');
        }

        noteTitle = note.title;
      }

      // If parentTaskId is provided, lock the parent and check it can take a subtask
      if (data.parentTaskId) {
        await lockTaskRows(tx, [data.parentTaskId]);
        await assertValidParent(tx, userId, data.parentTaskId);
      }

      // Handle tags if provided - use upsert to prevent race conditions
      let tagConnections: Prisma.TaskTagCreateWithoutTaskInput[] = [];
      if (data.tags && data.tags.length > 0) {
        const tagUpserts = data.tags.map((tagName) =>
          tx.tag.upsert({
            where: { userId_name: { userId, name: tagName } },
            update: {},
            create: { name: tagName, userId, createdByTokenId: createdByTokenId || null },
          })
        );

        const tags = await Promise.all(tagUpserts);
        tagConnections = tags.map((tag) => ({
          tag: { connect: { id: tag.id } },
        }));
      }

      // Prepare links if provided
      let linkConnections: Prisma.TaskLinkCreateWithoutTaskInput[] = [];
      if (data.links && data.links.length > 0) {
        linkConnections = data.links.map((link) => ({
          url: link.url,
          title: link.title || null,
        }));
      }

      // Create task with tags and links
      const task = await tx.task.create({
        data: {
          title: data.title,
          description: data.description || null,
          status: data.status || 'PENDING',
          // A task can now be created already completed (API and MCP accept status on create),
          // so set completedAt the same way updateTask and updateTaskStatus do
          completedAt: data.status === 'COMPLETED' ? new Date() : null,
          priority: data.priority || 'MEDIUM',
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          waitingOn: data.waitingOn ?? null,
          source: data.source ?? null,
          externalId: data.externalId ?? null,
          parentTaskId: data.parentTaskId ?? null,
          userId,
          noteId: data.noteId || null,
          noteTitle: noteTitle || null,
          folderId: data.folderId || null,
          createdByTokenId: createdByTokenId || null,
          tags: {
            create: tagConnections,
          },
          links: {
            create: linkConnections,
          },
        },
        include: taskDetailInclude,
      });

      // Transform tags to simpler format
      return {
        ...task,
        tags: task.tags.map((tt) => tt.tag),
      };
    });
  } catch (error) {
    if (isSyncIdentityConflict(error)) {
      throw new ConflictError('A task with this source and externalId already exists');
    }
    throw error;
  }
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, userId: string, data: UpdateTaskInput, createdByTokenId?: string) {
  return prisma.$transaction(async (tx: any) => {
    // Verify task exists and belongs to user
    const existingTask = await tx.task.findFirst({
      where: {
        id: taskId,
        userId,
      },
    });

    if (!existingTask) {
      throw new Error('Task not found');
    }

    // If a parent is being set: one level only, so the parent must not be a subtask
    // and this task must not have subtasks of its own. Both rows are locked first.
    if (data.parentTaskId) {
      if (data.parentTaskId === taskId) {
        throw new BadRequestError('A task cannot be its own parent');
      }
      await lockTaskRows(tx, [taskId, data.parentTaskId]);
      await assertValidParent(tx, userId, data.parentTaskId);
      const subtaskCount = await tx.task.count({ where: { parentTaskId: taskId } });
      if (subtaskCount > 0) {
        throw new BadRequestError('A task with subtasks cannot become a subtask');
      }
    }

    // If folderId is being updated, verify it belongs to the user
    if (data.folderId !== undefined && data.folderId !== null) {
      const folder = await tx.folder.findFirst({
        where: {
          id: data.folderId,
          userId,
        },
      });

      if (!folder) {
        throw new Error('Folder not found');
      }
    }

    // If noteId is being updated, verify it belongs to the user
    let noteTitle: string | undefined | null = undefined;
    if (data.noteId !== undefined) {
      if (data.noteId === null) {
        noteTitle = null;
      } else {
        const note = await tx.note.findFirst({
          where: {
            id: data.noteId,
            userId,
          },
        });

        if (!note) {
          throw new Error('Note not found');
        }

        noteTitle = note.title;
      }
    }

    // Handle tags if provided
    if (data.tags !== undefined) {
      // Remove existing tag associations
      await tx.taskTag.deleteMany({
        where: { taskId },
      });

      // Add new tags using upsert to prevent race conditions
      if (data.tags.length > 0) {
        const tagUpserts = data.tags.map((tagName) =>
          tx.tag.upsert({
            where: { userId_name: { userId, name: tagName } },
            update: {},
            create: { name: tagName, userId, createdByTokenId: createdByTokenId || null },
          })
        );
        const tags = await Promise.all(tagUpserts);

        // Create task-tag associations
        await tx.taskTag.createMany({
          data: tags.map((tag) => ({
            taskId,
            tagId: tag.id,
          })),
        });
      }
    }

    // Handle links if provided (replace all)
    if (data.links !== undefined) {
      // Remove existing links
      await tx.taskLink.deleteMany({
        where: { taskId },
      });

      // Add new links
      if (data.links.length > 0) {
        await tx.taskLink.createMany({
          data: data.links.map((link) => ({
            taskId,
            url: link.url,
            title: link.title || null,
          })),
        });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) {
      updateData.status = data.status;
      // Set completedAt timestamp when marking as completed
      if (data.status === 'COMPLETED') {
        updateData.completedAt = new Date();
      } else if (existingTask.completedAt) {
        // Clear completedAt if task is moved back to non-completed status
        updateData.completedAt = null;
      }
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.folderId !== undefined) updateData.folderId = data.folderId;
    if (data.noteId !== undefined) updateData.noteId = data.noteId;
    if (noteTitle !== undefined) updateData.noteTitle = noteTitle;
    // waitingOn is free text the server never touches on a status change; the client clears it
    if (data.waitingOn !== undefined) updateData.waitingOn = data.waitingOn;
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    }
    if (data.parentTaskId !== undefined) updateData.parentTaskId = data.parentTaskId;

    // Update task
    const task = await tx.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        parent: parentSelect,
        subtasks: subtasksSelect,
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        note: {
          select: {
            id: true,
            title: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        links: {
          select: {
            id: true,
            url: true,
            title: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Transform tags to simpler format
    return {
      ...task,
      tags: task.tags.map((tt: any) => tt.tag),
    };
  });
}

/**
 * Quick update task status
 */
export async function updateTaskStatus(taskId: string, userId: string, status: string) {
  // Prepare update data
  const updateData: any = { status };
  if (status === 'COMPLETED') {
    updateData.completedAt = new Date();
  } else {
    // Clear completedAt if task is moved back to non-completed status
    updateData.completedAt = null;
  }

  // Use updateMany for atomic operation that verifies ownership
  const result = await prisma.task.updateMany({
    where: {
      id: taskId,
      userId,
    },
    data: updateData,
  });

  // Check if task was found and updated
  if (result.count === 0) {
    throw new Error('Task not found');
  }

  // Fetch and return the updated task
  const updatedTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  return updatedTask!;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string, userId: string) {
  // Verify task exists and belongs to user
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      userId,
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  // Permanently delete task (tags will be cascade deleted via TaskTag relation)
  await prisma.task.delete({
    where: { id: taskId },
  });

  return { success: true };
}

/**
 * Get task statistics for a user
 */
export async function getTaskStats(userId: string) {
  const now = new Date();

  const [totalTasks, pendingTasks, inProgressTasks, completedTasks, overdueTasks, waitingTasks] =
    await prisma.$transaction([
      prisma.task.count({ where: { userId } }),
      prisma.task.count({ where: { userId, status: 'PENDING' } }),
      prisma.task.count({ where: { userId, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { userId, status: 'COMPLETED' } }),
      // WAITING counts as open, so a waiting task past its due date is overdue
      prisma.task.count({
        where: {
          userId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          dueDate: { lt: now },
        },
      }),
      prisma.task.count({ where: { userId, status: 'WAITING' } }),
    ]);

  return {
    totalTasks,
    pendingTasks,
    inProgressTasks,
    waitingTasks,
    completedTasks,
    overdueTasks,
  };
}

/**
 * Add a link to a task
 * Uses a transaction to prevent race conditions on link limit
 */
export async function addTaskLink(
  taskId: string,
  userId: string,
  data: { url: string; title?: string }
) {
  return prisma.$transaction(async (tx) => {
    // Verify task exists and belongs to user, with lock for update
    const task = await tx.task.findFirst({
      where: {
        id: taskId,
        userId,
      },
      include: {
        _count: {
          select: { links: true },
        },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // Check link limit (max 10) within transaction
    if (task._count.links >= 10) {
      throw new Error('Maximum 10 links per task');
    }

    // Create the link within transaction
    const link = await tx.taskLink.create({
      data: {
        taskId,
        url: data.url,
        title: data.title || null,
      },
      select: {
        id: true,
        url: true,
        title: true,
        createdAt: true,
      },
    });

    return link;
  });
}

/**
 * Update a task link
 * Verifies the link belongs to the specified task and user
 */
export async function updateTaskLink(
  taskId: string,
  linkId: string,
  userId: string,
  data: { url?: string; title?: string | null }
) {
  // Verify link exists, belongs to the specified task, and the task belongs to the user
  const link = await prisma.taskLink.findFirst({
    where: {
      id: linkId,
      taskId, // Verify link belongs to the specified task
      task: {
        userId, // Verify task belongs to the user
      },
    },
  });

  if (!link) {
    throw new Error('Link not found');
  }

  // Update the link
  const updateData: any = {};
  if (data.url !== undefined) updateData.url = data.url;
  if (data.title !== undefined) updateData.title = data.title;

  const updatedLink = await prisma.taskLink.update({
    where: { id: linkId },
    data: updateData,
    select: {
      id: true,
      url: true,
      title: true,
      createdAt: true,
    },
  });

  return updatedLink;
}

/**
 * Delete a task link
 * Verifies the link belongs to the specified task and user
 */
export async function deleteTaskLink(taskId: string, linkId: string, userId: string) {
  // Verify link exists, belongs to the specified task, and the task belongs to the user
  const link = await prisma.taskLink.findFirst({
    where: {
      id: linkId,
      taskId, // Verify link belongs to the specified task
      task: {
        userId, // Verify task belongs to the user
      },
    },
  });

  if (!link) {
    throw new Error('Link not found');
  }

  await prisma.taskLink.delete({
    where: { id: linkId },
  });

  return { success: true };
}

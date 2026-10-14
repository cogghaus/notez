// Task types
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskLink {
  id: string;
  url: string;
  title?: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  /** Do not start before */
  startDate?: string | null;
  /** Who or what a WAITING task waits on */
  waitingOn?: string | null;
  /** System that filed the task (e.g. "foyer"), with its id there */
  source?: string | null;
  externalId?: string | null;
  parentTaskId?: string | null;
  noteId?: string | null;
  noteTitle?: string | null;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  folder?: {
    id: string;
    name: string;
  } | null;
  note?: {
    id: string;
    title: string;
  } | null;
  tags?: Array<{
    id: string;
    name: string;
  }>;
  links?: TaskLink[];
  parent?: {
    id: string;
    title: string;
  } | null;
  /** Present on a single task (GET /api/tasks/:id), not on list items */
  subtasks?: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    dueDate?: string | null;
  }>;
}

export interface TaskStats {
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  waitingTasks: number;
  completedTasks: number;
  overdueTasks: number;
}

export interface ExtractedTask {
  noteId: string;
  noteTitle: string;
  title: string;
  checked: boolean;
  folderId?: string | null;
}

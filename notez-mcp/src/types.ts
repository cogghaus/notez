/** Shared types for the Notez MCP server */

export interface NotezNote {
  id: string;
  title: string;
  content: string | null;
  plainText?: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  folder?: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
}

/** Task statuses, in workflow order (mirrors the backend's TASK_STATUSES) */
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TaskSortBy = 'priority' | 'dueDate' | 'createdAt' | 'title' | 'startDate';

export interface NotezTaskLink {
  id: string;
  url: string;
  title: string | null;
  createdAt: string;
}

export interface NotezTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  /** Do not start before */
  startDate: string | null;
  /** Who or what the task is waiting on (meaningful with status WAITING) */
  waitingOn: string | null;
  /** System that filed the task (e.g. "foyer"); unique per user together with externalId */
  source: string | null;
  externalId: string | null;
  parentTaskId: string | null;
  noteId: string | null;
  noteTitle: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  folder?: { id: string; name: string } | null;
  note?: { id: string; title: string } | null;
  parent?: { id: string; title: string } | null;
  /** Present on a single task (get, by-external-id), not on list items */
  subtasks?: { id: string; title: string; status: TaskStatus; dueDate: string | null }[];
  tags: { id: string; name: string }[];
  links?: NotezTaskLink[];
}

export interface TaskLinkInput {
  url: string;
  title?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  startDate?: string;
  waitingOn?: string;
  noteId?: string;
  folderId?: string;
  parentTaskId?: string;
  links?: TaskLinkInput[];
  /** Must be sent together with externalId */
  source?: string;
  externalId?: string;
  tags?: string[];
}

/** source and externalId are fixed at creation and cannot be updated */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  startDate?: string | null;
  waitingOn?: string | null;
  noteId?: string | null;
  folderId?: string | null;
  parentTaskId?: string | null;
  /** Replaces all links */
  links?: TaskLinkInput[];
  /** Replaces all tags */
  tags?: string[];
}

export interface ListTasksOptions {
  /** One status or several (sent as a comma list) */
  status?: TaskStatus | TaskStatus[];
  source?: string;
  /** Requires source */
  externalId?: string;
  parentTaskId?: string;
  folderId?: string;
  sortBy?: TaskSortBy;
  sortOrder?: 'asc' | 'desc';
  /** 1 to 100 (server default 20) */
  limit?: number;
  offset?: number;
}

export interface NotezFolder {
  id: string;
  name: string;
  icon: string;
  noteCount: number;
}

export interface SearchResponse {
  results: NotezNote[];
  total: number;
  hasMore: boolean;
}

export interface TaskListResponse {
  tasks: NotezTask[];
  total: number;
  limit: number;
  offset: number;
}

export interface NoteListResponse {
  notes: NotezNote[];
  total: number;
}

export interface NotezTag {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
}

export interface NotezShare {
  id: string;
  noteId: string;
  userId: string;
  permission: 'VIEW' | 'EDIT';
  sharedWith: { id: string; username: string; email: string };
  createdAt: string;
}

export interface SuccessResponse {
  success: true;
  message?: string;
  noteCount?: number;
}

import type {
  NotezNote,
  NotezTask,
  NotezFolder,
  NotezTag,
  NotezShare,
  SearchResponse,
  TaskListResponse,
  NoteListResponse,
  SuccessResponse,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksOptions,
} from './types.js';

/**
 * HTTP client for the Notez /api/mcp/* endpoints
 */
export class NotezClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/mcp${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      ...(options.headers as Record<string, string>),
    };
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000), // 15 second timeout
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      let message: string;
      try {
        const json = JSON.parse(body);
        message = json.message || json.error || body;
      } catch {
        message = body;
      }
      throw new Error(`Notez API error (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  // ─── Notes ──────────────────────────────────────────────────────────

  async searchNotes(query: string, limit = 20): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return this.request<SearchResponse>(`/notes/search?${params}`);
  }

  async getNote(id: string): Promise<NotezNote> {
    return this.request<NotezNote>(`/notes/${id}`);
  }

  async getNoteByTitle(title: string): Promise<NotezNote> {
    const params = new URLSearchParams({ title });
    return this.request<NotezNote>(`/notes/by-title?${params}`);
  }

  async listNotes(options?: {
    folderId?: string | null;
    tagId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<NoteListResponse> {
    const params = new URLSearchParams();
    if (options?.folderId !== undefined) params.set('folderId', options.folderId === null ? 'null' : options.folderId);
    if (options?.tagId) params.set('tagId', options.tagId);
    if (options?.search) params.set('search', options.search);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    return this.request<NoteListResponse>(`/notes?${params}`);
  }

  async listRecentNotes(limit = 20): Promise<NoteListResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    return this.request<NoteListResponse>(`/notes/recent?${params}`);
  }

  async createNote(data: {
    title: string;
    content?: string;
    folderId?: string;
    tags?: string[];
  }): Promise<NotezNote> {
    return this.request<NotezNote>('/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async appendToNote(id: string, content: string): Promise<NotezNote> {
    return this.request<NotezNote>(`/notes/${id}/append`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async updateNote(id: string, data: {
    title?: string;
    content?: string;
    folderId?: string | null;
    tags?: string[];
  }): Promise<NotezNote> {
    return this.request<NotezNote>(`/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(id: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/notes/${id}`, {
      method: 'DELETE',
    });
  }

  async restoreNote(id: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/notes/${id}/restore`, {
      method: 'POST',
    });
  }

  // ─── Tasks ──────────────────────────────────────────────────────────

  /**
   * List tasks. Takes an options object, or the older (status, limit) pair.
   */
  async listTasks(options?: ListTasksOptions | TaskStatus, limit = 20): Promise<TaskListResponse> {
    const opts: ListTasksOptions = typeof options === 'string' || options === undefined
      ? { status: options, limit }
      : options;
    const params = new URLSearchParams();
    if (opts.status !== undefined) {
      params.set('status', Array.isArray(opts.status) ? opts.status.join(',') : opts.status);
    }
    if (opts.source) params.set('source', opts.source);
    if (opts.externalId) params.set('externalId', opts.externalId);
    if (opts.parentTaskId) params.set('parentTaskId', opts.parentTaskId);
    if (opts.folderId) params.set('folderId', opts.folderId);
    if (opts.sortBy) params.set('sortBy', opts.sortBy);
    if (opts.sortOrder) params.set('sortOrder', opts.sortOrder);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    return this.request<TaskListResponse>(`/tasks?${params}`);
  }

  async getTask(id: string): Promise<NotezTask> {
    return this.request<NotezTask>(`/tasks/${id}`);
  }

  /** Find a task by the id another system gave it; 404 (thrown) when absent */
  async getTaskByExternalId(source: string, externalId: string): Promise<NotezTask> {
    const params = new URLSearchParams({ source, externalId });
    return this.request<NotezTask>(`/tasks/by-external-id?${params}`);
  }

  async createTask(data: CreateTaskInput): Promise<NotezTask> {
    return this.request<NotezTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<NotezTask> {
    return this.request<NotezTask>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async updateTask(id: string, data: UpdateTaskInput): Promise<NotezTask> {
    return this.request<NotezTask>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Folders ────────────────────────────────────────────────────────

  async listFolders(): Promise<NotezFolder[]> {
    return this.request<NotezFolder[]>('/folders');
  }

  async createFolder(data: {
    name: string;
    icon?: string;
  }): Promise<NotezFolder> {
    return this.request<NotezFolder>('/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFolder(id: string, data: {
    name?: string;
    icon?: string;
  }): Promise<NotezFolder> {
    return this.request<NotezFolder>(`/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFolder(id: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/folders/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Tags ───────────────────────────────────────────────────────────

  async listTags(): Promise<NotezTag[]> {
    return this.request<NotezTag[]>('/tags');
  }

  async renameTag(id: string, name: string): Promise<NotezTag> {
    return this.request<NotezTag>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async deleteTag(id: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/tags/${id}`, {
      method: 'DELETE',
    });
  }

  // ─── Sharing ────────────────────────────────────────────────────────

  async shareNote(noteId: string, usernameOrEmail: string, permission?: 'VIEW' | 'EDIT'): Promise<NotezShare> {
    return this.request<NotezShare>(`/notes/${noteId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, permission }),
    });
  }

  async listShares(noteId: string): Promise<NotezShare[]> {
    return this.request<NotezShare[]>(`/notes/${noteId}/shares`);
  }

  async unshareNote(noteId: string, shareId: string): Promise<SuccessResponse> {
    return this.request<SuccessResponse>(`/notes/${noteId}/shares/${shareId}`, {
      method: 'DELETE',
    });
  }

  async updateSharePermission(noteId: string, shareId: string, permission: 'VIEW' | 'EDIT'): Promise<NotezShare> {
    return this.request<NotezShare>(`/notes/${noteId}/shares/${shareId}`, {
      method: 'PATCH',
      body: JSON.stringify({ permission }),
    });
  }
}

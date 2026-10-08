import axios from 'axios';

// API base URL - use environment variable or default to relative path for production
// In production (same-origin), use '' (relative) so API calls go to same domain
// In development (different ports), use localhost:3000
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');

// Create axios instance with default config
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Important for cookies (refresh token)
  headers: {
    'Content-Type': 'application/json',
  },
  // Custom params serializer to handle arrays without brackets
  // e.g., status[]=PENDING&status[]=IN_PROGRESS becomes status=PENDING&status=IN_PROGRESS
  paramsSerializer: {
    indexes: null, // Removes brackets from array params
  },
});

// Request interceptor to add access token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth endpoints that should NOT trigger token refresh on 401
// These endpoints return 401 for invalid credentials, not expired tokens
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/setup', '/api/auth/refresh'];

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';

    // Don't try to refresh for auth endpoints - their 401s mean invalid credentials
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => requestUrl.startsWith(endpoint));

    // If 401, not an auth endpoint, and we haven't tried to refresh yet
    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token
        const response = await axios.post(
          `${API_BASE_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { accessToken } = response.data;

        // Store new access token
        localStorage.setItem('accessToken', accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and signal auth failure
        localStorage.removeItem('accessToken');
        // Dispatch custom event to notify AuthContext
        window.dispatchEvent(new Event('auth-failure'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API endpoints
export const authApi = {
  setupNeeded: () => api.get('/api/auth/setup-needed'),

  setup: (data: { username: string; email: string; password: string }) =>
    api.post('/api/auth/setup', data),

  login: (credentials: { usernameOrEmail: string; password: string }) =>
    api.post('/api/auth/login', credentials),

  logout: () => api.post('/api/auth/logout'),

  refresh: () => api.post('/api/auth/refresh'),

  me: () => api.get('/api/auth/me'),

  oidcConfig: () =>
    api.get<{ enabled: boolean; providerName: string }>('/api/auth/oidc/config'),

  // Full-page navigation target (not an XHR): starts the SSO redirect. Relative on
  // purpose: in dev the Vite proxy forwards /api, so the callback's redirects back to
  // /login land on the SPA (set APP_URL to the Vite origin when testing SSO locally).
  oidcLoginUrl: '/api/auth/oidc/login',

  // Signed-in user connects their account; returns the provider URL to navigate to
  oidcLink: () => api.post<{ url: string }>('/api/auth/oidc/link'),

  // After the provider redirect, link the pending identity to the signed-in user
  oidcLinkConfirm: () => api.post<{ linked: boolean }>('/api/auth/oidc/link/confirm'),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/api/auth/change-password', data),
};

export const notesApi = {
  list: (params?: { folderId?: string; tagId?: string; search?: string; limit?: number; offset?: number }) =>
    api.get('/api/notes', { params }),

  get: (id: string) => api.get(`/api/notes/${id}`),

  create: (data: { title: string; content?: string; folderId?: string; tags?: string[] }) =>
    api.post('/api/notes', data),

  update: (id: string, data: { title?: string; content?: string; folderId?: string | null; tags?: string[] }) =>
    api.patch(`/api/notes/${id}`, data),

  delete: (id: string) => api.delete(`/api/notes/${id}`),

  stats: () => api.get('/api/notes/stats'),

  // Trash operations
  listTrash: () =>
    api.get('/api/notes/trash').catch((error) => {
      if (import.meta.env.DEV) console.error('Failed to list trash notes:', error);
      throw error;
    }),

  restore: (id: string) =>
    api.post(`/api/notes/${id}/restore`).catch((error) => {
      if (import.meta.env.DEV) console.error('Failed to restore note:', error);
      throw error;
    }),

  permanentDelete: (id: string) =>
    api.delete(`/api/notes/${id}/permanent`).catch((error) => {
      if (import.meta.env.DEV) console.error('Failed to permanently delete note:', error);
      throw error;
    }),
};

export const foldersApi = {
  list: () => api.get('/api/folders'),

  get: (id: string) => api.get(`/api/folders/${id}`),

  create: (data: { name: string; icon?: string }) => api.post('/api/folders', data),

  update: (id: string, data: { name?: string; icon?: string }) => api.patch(`/api/folders/${id}`, data),

  delete: (id: string) => api.delete(`/api/folders/${id}`),

  stats: () => api.get('/api/folders/stats'),
};

export const usersApi = {
  list: (includeInactive?: boolean) => api.get('/api/users', { params: { includeInactive } }),

  get: (id: string) => api.get(`/api/users/${id}`),

  create: (data: {
    username: string;
    email?: string;
    password?: string;
    role?: string;
    isServiceAccount?: boolean;
    tokenName?: string;
    tokenScopes?: string[];
    tokenExpiresIn?: string | null;
  }) => api.post('/api/users', data),

  update: (id: string, data: { isActive?: boolean; mustChangePassword?: boolean; role?: string }) =>
    api.patch(`/api/users/${id}`, data),

  delete: (id: string) => api.delete(`/api/users/${id}`),

  resetPassword: (id: string, newPassword: string) =>
    api.post(`/api/users/${id}/reset-password`, { newPassword }),

  stats: () => api.get('/api/users/stats'),
};

export interface ServiceAccountStat {
  id: string;
  username: string;
  noteCount: number;
  folderCount: number;
  tagCount: number;
  taskCount: number;
  lastActivity: string | null;
  recentNotes: Array<{ id: string; title: string; updatedAt: string }>;
  tokenCount: number;
  earliestTokenExpiry: string | null;
  lastTokenUsedAt: string | null;
}

export const serviceAccountsApi = {
  list: () => api.get('/api/admin/service-accounts'),

  stats: () => api.get<{ stats: ServiceAccountStat[] }>('/api/admin/service-accounts/stats'),

  listNotes: (params?: { limit?: number; offset?: number; userId?: string }) =>
    api.get('/api/admin/service-accounts/notes', { params }),

  getNote: (id: string) => api.get(`/api/admin/service-accounts/notes/${id}`),

  listTasks: (params?: { limit?: number; offset?: number }) =>
    api.get('/api/admin/service-accounts/tasks', { params }),

  // Per-account workspace endpoints
  getAccountFolders: (id: string) =>
    api.get(`/api/admin/service-accounts/${id}/folders`),

  getAccountNotes: (id: string, params?: { folderId?: string; limit?: number; offset?: number }) =>
    api.get(`/api/admin/service-accounts/${id}/notes`, { params }),

  getAccountTags: (id: string) =>
    api.get(`/api/admin/service-accounts/${id}/tags`),

  getAccountActivity: (id: string, params?: { limit?: number; before?: string }) =>
    api.get(`/api/admin/service-accounts/${id}/activity`, { params }),

  listTokens: (id: string) =>
    api.get(`/api/admin/service-accounts/${id}/tokens`),

  createToken: (id: string, data: { name: string; scopes: string[]; expiresIn?: string | null }) =>
    api.post(`/api/admin/service-accounts/${id}/tokens`, data),

  revokeToken: (id: string, tokenId: string) =>
    api.delete(`/api/admin/service-accounts/${id}/tokens/${tokenId}`),
};

export const systemApi = {
  getInfo: () => api.get('/api/system/info'),
};

export const tagsApi = {
  list: () => api.get('/api/tags'),

  get: (id: string) => api.get(`/api/tags/${id}`),

  search: (query?: string, limit?: number) =>
    api.get('/api/tags/search', { params: { q: query, limit } }),

  rename: (id: string, name: string) => api.patch(`/api/tags/${id}`, { name }),

  delete: (id: string) => api.delete(`/api/tags/${id}`),

  stats: () => api.get('/api/tags/stats'),
};

export const aiApi = {
  // AI Settings
  getSettings: () => api.get('/api/ai/settings'),

  saveSettings: (data: { provider: 'anthropic' | 'openai' | 'gemini'; apiKey: string; model?: string }) =>
    api.put('/api/ai/settings', data),

  updateModel: (model: string) =>
    api.patch('/api/ai/settings', { model }),

  testConnection: (data: { provider: 'anthropic' | 'openai' | 'gemini'; apiKey: string; model?: string }) =>
    api.post('/api/ai/test-connection', data),

  // List models using stored API key (no key required)
  getModels: () => api.get('/api/ai/models'),

  // List models with provided API key (for initial setup/key change)
  listModels: (data: { provider: 'anthropic' | 'openai' | 'gemini'; apiKey: string; model?: string }) =>
    api.post('/api/ai/list-models', data),

  // AI Features
  summarize: (data: { content: string; maxLength?: number }) =>
    api.post('/api/ai/summarize', data),

  suggestTitle: (data: { content: string; maxLength?: number }) =>
    api.post('/api/ai/suggest-title', data),

  suggestTags: (data: { content: string; maxTags?: number }) =>
    api.post('/api/ai/suggest-tags', data),
};

export const searchApi = {
  search: (params: { q: string; folderId?: string; limit?: number; offset?: number }) =>
    api.get('/api/search', { params }),
};

export const profileApi = {
  getProfile: () => api.get('/api/profile/me'),

  changeUsername: (username: string) => api.patch('/api/profile/username', { username }),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  deleteAvatar: () => api.delete('/api/profile/avatar'),

  getAvatarUrl: (userId: string) => `/api/profile/avatar/${userId}`,
};

export const referencesApi = {
  // Find all notes containing a wiki-link to the given keyword
  findByKeyword: (keyword: string, params?: { limit?: number; offset?: number }) =>
    api.get('/api/notes/references', { params: { keyword, ...params } }),

  // Get backlinks for a specific note (notes that link TO this note)
  getBacklinks: (noteId: string) =>
    api.get(`/api/notes/${noteId}/backlinks`),

  // Get all unique keywords used in wiki-links (for autocomplete)
  getKeywords: () =>
    api.get('/api/notes/keywords'),
};

export type TaskSortBy = 'priority' | 'dueDate' | 'createdAt' | 'title';
export type TaskSortOrder = 'asc' | 'desc';

export const tasksApi = {
  list: (params?: {
    status?: string | string[];
    priority?: string;
    folderId?: string;
    noteId?: string;
    tagId?: string;
    overdue?: boolean;
    sortBy?: TaskSortBy;
    sortOrder?: TaskSortOrder;
    limit?: number;
    offset?: number;
  }) => api.get('/api/tasks', { params }),

  get: (id: string) => api.get(`/api/tasks/${id}`),

  create: (data: {
    title: string;
    description?: string;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    dueDate?: string;
    noteId?: string;
    folderId?: string;
    tags?: string[];
    links?: Array<{ url: string; title?: string }>;
  }) => api.post('/api/tasks', data),

  update: (
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      dueDate?: string | null;
      noteId?: string | null;
      folderId?: string | null;
      tags?: string[];
      links?: Array<{ url: string; title?: string }>;
    }
  ) => api.put(`/api/tasks/${id}`, data),

  updateStatus: (id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') =>
    api.patch(`/api/tasks/${id}/status`, { status }),

  delete: (id: string) => api.delete(`/api/tasks/${id}`),

  stats: () => api.get('/api/tasks/stats'),

  // Task import operations
  scan: (data?: { folderId?: string; noteIds?: string[] }) =>
    api.post('/api/tasks/scan', data || {}),

  import: (data: { tasks: Array<{
    noteId: string;
    noteTitle: string;
    title: string;
    checked: boolean;
    folderId?: string | null;
  }> }) =>
    api.post('/api/tasks/import', data),

  // Task link management
  addLink: (taskId: string, data: { url: string; title?: string }) =>
    api.post(`/api/tasks/${taskId}/links`, data),

  updateLink: (taskId: string, linkId: string, data: { url?: string; title?: string | null }) =>
    api.patch(`/api/tasks/${taskId}/links/${linkId}`, data),

  deleteLink: (taskId: string, linkId: string) =>
    api.delete(`/api/tasks/${taskId}/links/${linkId}`),
};

// Feedback types
export type FeedbackType = 'BUG' | 'FEATURE';
export type FeedbackStatus = 'NEW' | 'REVIEWED' | 'APPROVED' | 'PUBLISHED' | 'DECLINED';
export type FeedbackCategory = 'ui' | 'editor' | 'ai' | 'organization' | 'other';
export type FeedbackPriority = 'nice-to-have' | 'helpful' | 'critical';

export interface FeedbackSubmission {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  category?: FeedbackCategory;
  priority?: FeedbackPriority;
  status: FeedbackStatus;
  adminNotes?: string;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  shipped: boolean;
  shippedAt?: string;
  userId: string;
  user?: { id: string; username: string; email?: string };
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
}

export const feedbackApi = {
  // User endpoints
  submit: (data: {
    type: FeedbackType;
    title: string;
    description: string;
    category?: FeedbackCategory;
    priority?: FeedbackPriority;
  }) => api.post('/api/feedback', data),

  getMine: (params?: { limit?: number; offset?: number }) =>
    api.get('/api/feedback/mine', { params }),

  getById: (id: string) => api.get(`/api/feedback/${id}`),

  // Admin endpoints
  listAll: (params?: {
    type?: FeedbackType;
    status?: FeedbackStatus;
    category?: FeedbackCategory;
    limit?: number;
    offset?: number;
  }) => api.get('/api/admin/feedback', { params }),

  getByIdAdmin: (id: string) => api.get(`/api/admin/feedback/${id}`),

  update: (id: string, data: { status?: FeedbackStatus; adminNotes?: string }) =>
    api.patch(`/api/admin/feedback/${id}`, data),

  delete: (id: string) => api.delete(`/api/admin/feedback/${id}`),

  markShipped: (id: string) => api.post(`/api/admin/feedback/${id}/ship`),

  unmarkShipped: (id: string) => api.delete(`/api/admin/feedback/${id}/ship`),

  getStats: () => api.get('/api/admin/feedback/stats'),
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  linkType: string;
  linkId: string;
  createdAt: string;
  readAt?: string;
}

// WebSocket base URL (auto-detect from current protocol)
// Uses only the host (no path prefix) to avoid double-path issues with path-prefixed deployments.
export const WS_BASE_URL = (() => {
  if (import.meta.env.VITE_API_URL) {
    const url = new URL(import.meta.env.VITE_API_URL);
    return `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}`;
})();

export interface NoteShareInfo {
  shareId: string;
  permission: 'VIEW' | 'EDIT';
  owner: { id: string; username: string };
  sharedAt: string;
}

export interface NoteShare {
  id: string;
  noteId: string;
  permission: 'VIEW' | 'EDIT';
  sharedWith: { id: string; username: string; email: string | null };
  createdAt: string;
}

export interface SharedContact {
  id: string;
  username: string;
  email: string | null;
}

export const sharesApi = {
  shareNote: (noteId: string, data: { usernameOrEmail: string; permission: 'VIEW' | 'EDIT' }) =>
    api.post(`/api/notes/${noteId}/shares`, data),

  listShares: (noteId: string) =>
    api.get(`/api/notes/${noteId}/shares`),

  updatePermission: (noteId: string, shareId: string, permission: 'VIEW' | 'EDIT') =>
    api.patch(`/api/notes/${noteId}/shares/${shareId}`, { permission }),

  removeShare: (noteId: string, shareId: string) =>
    api.delete(`/api/notes/${noteId}/shares/${shareId}`),

  sharedWithMe: () =>
    api.get('/api/notes/shared-with-me'),

  sharedByMe: () =>
    api.get('/api/notes/shared-by-me'),

  getSharedContacts: (query?: string, limit?: number) =>
    api.get<{ contacts: SharedContact[] }>('/api/shares/contacts', { params: { q: query, limit } }),
};

export const tokensApi = {
  list: () => api.get('/api/tokens'),

  create: (data: { name: string; scopes: string[]; expiresIn?: string | null }) =>
    api.post('/api/tokens', data),

  revoke: (id: string) => api.delete(`/api/tokens/${id}`),
};

export const agentTokensApi = {
  list: () => api.get('/api/tokens/agents'),

  create: (data: {
    name: string;
    scopes: string[];
    expiresIn?: string | null;
    agentName: string;
    agentIcon: string;
    agentColor: string;
  }) => api.post('/api/tokens/agents', data),

  update: (id: string, data: {
    name?: string;
    agentName?: string;
    agentIcon?: string;
    agentColor?: string;
  }) => api.patch(`/api/tokens/agents/${id}`, data),

  // Uses generic token revoke endpoint (works for both regular and agent tokens)
  revoke: (id: string) => api.delete(`/api/tokens/${id}`),
};

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'paused' | 'disabled';
  metadata?: Record<string, unknown>;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseStatus?: number;
  responseBody?: string;
  responseTimeMs?: number;
  attemptNumber: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  nextRetryAt?: string;
  createdAt: string;
  event?: { eventType: string; entityType: string; entityId: string };
}

export const webhooksApi = {
  list: () => api.get<{ webhooks: Webhook[]; total: number }>('/api/webhooks'),

  get: (id: string) => api.get<Webhook>(`/api/webhooks/${id}`),

  create: (data: {
    url: string;
    events: string[];
    secret: string;
    metadata?: Record<string, unknown>;
  }) => api.post<Webhook>('/api/webhooks', data),

  update: (
    id: string,
    data: {
      url?: string;
      events?: string[];
      secret?: string;
      status?: 'active' | 'paused' | 'disabled';
      metadata?: Record<string, unknown>;
    },
  ) => api.patch<Webhook>(`/api/webhooks/${id}`, data),

  delete: (id: string) => api.delete(`/api/webhooks/${id}`),

  test: (id: string) => api.post<{ deliveryId: string }>(`/api/webhooks/${id}/test`),

  listDeliveries: (
    id: string,
    params?: {
      status?: string;
      eventType?: string;
      since?: string;
      limit?: number;
      offset?: number;
    },
  ) => api.get<{ deliveries: WebhookDelivery[]; total: number }>(`/api/webhooks/${id}/deliveries`, { params }),

  getDelivery: (webhookId: string, deliveryId: string) =>
    api.get<WebhookDelivery>(`/api/webhooks/${webhookId}/deliveries/${deliveryId}`),

  replayDelivery: (webhookId: string, deliveryId: string) =>
    api.post<{ deliveryId: string }>(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/replay`),

  replay: (
    id: string,
    data: { since: string; until?: string; eventTypes?: string[] },
  ) => api.post<{ queued: number }>(`/api/webhooks/${id}/replay`, data),
};

export const notificationsApi = {
  list: (params?: { limit?: number; offset?: number; unreadOnly?: boolean }) =>
    api.get('/api/notifications', { params }),

  getUnreadCount: () => api.get('/api/notifications/unread-count'),

  markAsRead: (id: string) => api.patch(`/api/notifications/${id}/read`),

  markAllAsRead: () => api.post('/api/notifications/mark-all-read'),

  delete: (id: string) => api.delete(`/api/notifications/${id}`),

  // Admin: send release notification to all users
  sendReleaseNotification: (version: string, highlights?: string) =>
    api.post('/api/admin/notifications/release', { version, highlights }),
};

// MCP Connector management (admin only)
export const mcpConnectorsApi = {
  list: (status?: string) =>
    api.get('/mcp/oauth/clients', { params: status ? { status } : undefined }),

  approve: (clientId: string) =>
    api.post(`/mcp/oauth/clients/${clientId}/approve`),

  reject: (clientId: string) =>
    api.post(`/mcp/oauth/clients/${clientId}/reject`),
};

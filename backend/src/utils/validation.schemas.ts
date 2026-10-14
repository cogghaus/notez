import { z } from 'zod';

// Password requirements: min 8 chars, 1 uppercase, 1 number, 1 special char
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

// Reserved usernames that cannot be claimed by new or renamed users
// Not applied to setupSchema (first admin may want to use "admin")
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'system', 'root', 'support', 'help',
  'null', 'undefined', 'api', 'notez', 'moderator', 'mod',
] as const;

const reservedUsernameCheck = (val: string) =>
  !RESERVED_USERNAMES.includes(val.toLowerCase() as typeof RESERVED_USERNAMES[number]);

const emailSchema = z.string().email('Invalid email address');

// Auth schemas
export const setupSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// User management schemas (admin)
export const createUserSchema = z.object({
  username: usernameSchema.refine(reservedUsernameCheck, 'This username is reserved'),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  role: z.enum(['admin', 'user']).default('user'),
  isServiceAccount: z.boolean().default(false),
  // Token config fields for service account creation
  tokenName: z.string().min(1).max(100).optional(),
  tokenScopes: z.array(z.enum(['read', 'write'])).min(1).max(2).optional(),
  tokenExpiresIn: z.enum(['30d', '90d', '1y']).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.isServiceAccount) {
    if (data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Service accounts do not use passwords',
        path: ['password'],
      });
    }
    if (data.role === 'admin') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Service accounts cannot have admin role',
        path: ['role'],
      });
    }
  } else {
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required for regular users',
        path: ['email'],
      });
    }
    if (!data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password is required',
        path: ['password'],
      });
    }
  }
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

// Admin password reset (used by admin to reset other users' passwords)
export const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

// User forgot password - request reset email
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// User password reset with token
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

// Profile schemas
export const changeUsernameSchema = z.object({
  username: usernameSchema.refine(reservedUsernameCheck, 'This username is reserved'),
});

export type ChangeUsernameInput = z.infer<typeof changeUsernameSchema>;

// Note schemas
export const createNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must not exceed 500 characters'),
  content: z.string().optional(),
  folderId: z.string().uuid('Invalid folder ID').optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must not exceed 500 characters').optional(),
  content: z.string().optional(),
  folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

export const listNotesQuerySchema = z.object({
  folderId: z.preprocess(
    (val) => (val === 'null' ? null : val),
    z.string().uuid('Invalid folder ID').nullable()
  ).optional(),
  tagId: z.string().uuid('Invalid tag ID').optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Folder icon options - curated Lucide icons
export const FOLDER_ICONS = [
  'folder', 'folder-open', 'briefcase', 'home', 'star', 'heart', 'bookmark',
  'file-text', 'code', 'terminal', 'book', 'archive', 'inbox', 'lightbulb',
  'target', 'flag', 'calendar', 'clock', 'users', 'user', 'settings',
  'camera', 'music', 'video', 'image', 'globe', 'map-pin', 'shopping-bag',
  // New icons for v0.30.2
  'palette', 'paintbrush', 'pencil', 'pen', 'pen-tool', 'flower', 'drama',
  'coffee', 'utensils', 'gift',
  // New tech/homelab icons for v0.31.0
  'server', 'cpu', 'hard-drive', 'network', 'wifi', 'database', 'cloud',
  'monitor', 'laptop', 'smartphone',
  // New icons for v1.3.0 — gaming, finance, education, health, nature, communication, security, entertainment, tools
  'gamepad-2', 'trophy', 'swords', 'dice-5', 'dollar-sign', 'credit-card',
  'graduation-cap', 'brain', 'flask-conical', 'dumbbell', 'mountain', 'tree-pine',
  'plane', 'mail', 'message-circle', 'lock', 'shield', 'headphones', 'tv', 'wrench',
] as const;

// Folder schemas
export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255, 'Folder name must not exceed 255 characters'),
  icon: z.enum(FOLDER_ICONS).default('folder').optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255, 'Folder name must not exceed 255 characters').optional(),
  icon: z.enum(FOLDER_ICONS).optional(),
});

// AI schemas
export const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional(),
});

export const aiModelUpdateSchema = z.object({
  model: z.string().min(1, 'Model is required'),
});

export const aiSummarizeSchema = z.object({
  content: z.string().min(1, 'Content is required').max(50000, 'Content too large'),
  maxLength: z.number().int().min(10).max(1000).default(100).optional(),
});

export const aiSuggestTitleSchema = z.object({
  content: z.string().min(1, 'Content is required').max(50000, 'Content too large'),
  maxLength: z.number().int().min(10).max(100).default(60).optional(),
});

export const aiSuggestTagsSchema = z.object({
  content: z.string().min(1, 'Content is required').max(50000, 'Content too large'),
  maxTags: z.number().int().min(1).max(20).default(5).optional(),
});

// Safe URL schema - only allows http(s) protocols
export const safeUrlSchema = z.string()
  .url('Invalid URL')
  .max(2048, 'URL must not exceed 2048 characters')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Only http and https URLs are allowed' }
  );

// Task link schema
const taskLinkSchema = z.object({
  url: safeUrlSchema,
  title: z.string().max(255, 'Link title must not exceed 255 characters').optional(),
});

// Task statuses: the single list every task schema (session API, external API, MCP) uses.
// Ordered as a workflow; the database enum order differs (WAITING was appended last).
export const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatusValue = typeof TASK_STATUSES[number];

// Task field schemas shared by the session routes, the external API and the MCP tools
export { taskLinkSchema };
export const taskWaitingOnSchema = z.string().max(255, 'waitingOn must not exceed 255 characters');
export const taskSourceSchema = z.string().regex(
  /^[a-z][a-z0-9_-]{1,49}$/,
  'source must be 2 to 50 characters: lowercase letters, digits, "_" or "-", starting with a letter'
);
export const taskExternalIdSchema = z.string()
  .min(1, 'externalId must not be empty')
  .max(255, 'externalId must not exceed 255 characters');
export const taskStartDateSchema = z.string().datetime();
export const taskParentIdSchema = z.string().uuid('Invalid parent task ID');

export const TASK_SOURCE_PAIR_MESSAGE = 'source and externalId must be given together';
export const TASK_START_AFTER_DUE_MESSAGE = 'startDate must not be after dueDate';
export const TASK_SYNC_IDENTITY_IMMUTABLE_MESSAGE = 'source and externalId are set at creation';

/**
 * Cross-field rules for a task create body: the sync identity is all or nothing,
 * and a task cannot start after it is due.
 */
export function refineTaskCreate(
  data: { source?: string; externalId?: string; startDate?: string | null; dueDate?: string | null },
  ctx: z.RefinementCtx
) {
  if ((data.source === undefined) !== (data.externalId === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: TASK_SOURCE_PAIR_MESSAGE,
      path: [data.source === undefined ? 'source' : 'externalId'],
    });
  }
  refineTaskDates(data, ctx);
}

/**
 * Cross-field rule for an update body. Only checks dates sent together;
 * a lone startDate or dueDate is not compared with the stored value.
 */
export function refineTaskDates(
  data: { startDate?: string | null; dueDate?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.startDate && data.dueDate && new Date(data.startDate) > new Date(data.dueDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: TASK_START_AFTER_DUE_MESSAGE, path: ['startDate'] });
  }
}

// Present on update bodies only to refuse them with a clear message (zod would otherwise strip them silently)
const taskSyncIdentityRefused = z.undefined({ errorMap: () => ({ message: TASK_SYNC_IDENTITY_IMMUTABLE_MESSAGE }) });

// Task schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must not exceed 500 characters'),
  description: z.string().optional(),
  status: taskStatusSchema.optional(), // the service defaults to PENDING
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM').optional(),
  dueDate: z.string().datetime().optional(),
  noteId: z.string().uuid('Invalid note ID').optional(),
  folderId: z.string().uuid('Invalid folder ID').optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
  links: z.array(taskLinkSchema).max(10, 'Maximum 10 links per task').optional(),
  waitingOn: taskWaitingOnSchema.nullable().optional(),
  source: taskSourceSchema.optional(),
  externalId: taskExternalIdSchema.optional(),
  startDate: taskStartDateSchema.nullable().optional(),
  parentTaskId: taskParentIdSchema.nullable().optional(),
}).superRefine(refineTaskCreate);

export const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must not exceed 500 characters').optional(),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  noteId: z.string().uuid('Invalid note ID').nullable().optional(),
  folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
  links: z.array(taskLinkSchema).max(10, 'Maximum 10 links per task').optional(),
  waitingOn: taskWaitingOnSchema.nullable().optional(),
  startDate: taskStartDateSchema.nullable().optional(),
  parentTaskId: taskParentIdSchema.nullable().optional(),
  source: taskSyncIdentityRefused,
  externalId: taskSyncIdentityRefused,
}).superRefine(refineTaskDates);

// Task link management schemas
export const addTaskLinkSchema = z.object({
  url: safeUrlSchema,
  title: z.string().max(255, 'Link title must not exceed 255 characters').optional(),
});

export const updateTaskLinkSchema = z.object({
  url: safeUrlSchema.optional(),
  title: z.string().max(255, 'Link title must not exceed 255 characters').nullable().optional(),
});

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema,
});

export const TASK_SORT_FIELDS = ['priority', 'dueDate', 'createdAt', 'title', 'startDate'] as const;
export type TaskSortField = typeof TASK_SORT_FIELDS[number];

export const TASK_EXTERNAL_ID_NEEDS_SOURCE_MESSAGE = 'externalId requires source';

/** Upper bound for list offsets: bounds the work a deep OFFSET scan can ask of the database */
export const TASK_LIST_MAX_OFFSET = 100_000;

export const listTasksQuerySchema = z.object({
  status: z.union([
    taskStatusSchema,
    z.array(taskStatusSchema),
  ]).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  folderId: z.string().uuid('Invalid folder ID').optional(),
  noteId: z.string().uuid('Invalid note ID').optional(),
  tagId: z.string().uuid('Invalid tag ID').optional(),
  source: taskSourceSchema.optional(),
  externalId: taskExternalIdSchema.optional(),
  parentTaskId: taskParentIdSchema.optional(),
  overdue: z.coerce.boolean().optional(),
  sortBy: z.enum(TASK_SORT_FIELDS).default('priority').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(TASK_LIST_MAX_OFFSET).default(0),
}).refine((q) => q.externalId === undefined || q.source !== undefined, {
  message: TASK_EXTERNAL_ID_NEEDS_SOURCE_MESSAGE,
  path: ['externalId'],
});

export const scanTasksSchema = z.object({
  folderId: z.string().uuid('Invalid folder ID').optional(),
  noteIds: z.array(z.string().uuid()).optional(),
});

export const importTasksSchema = z.object({
  tasks: z.array(z.object({
    noteId: z.string().uuid('Invalid note ID'),
    noteTitle: z.string(),
    title: z.string().min(1).max(500),
    checked: z.boolean(),
    folderId: z.string().uuid('Invalid folder ID').nullable().optional(),
  })),
});

// Tag schemas
export const renameTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(100, 'Tag name must not exceed 100 characters'),
});

export const tagSearchQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// UUID param schema (reusable)
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const tagIdParamSchema = z.object({
  id: z.string().uuid('Invalid tag ID'),
});

// Type exports
export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type AIConfigInput = z.infer<typeof aiConfigSchema>;
export type AIModelUpdateInput = z.infer<typeof aiModelUpdateSchema>;
export type AISummarizeInput = z.infer<typeof aiSummarizeSchema>;
export type AISuggestTitleInput = z.infer<typeof aiSuggestTitleSchema>;
export type AISuggestTagsInput = z.infer<typeof aiSuggestTagsSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type ScanTasksInput = z.infer<typeof scanTasksSchema>;
export type ImportTasksInput = z.infer<typeof importTasksSchema>;
export type AddTaskLinkInput = z.infer<typeof addTaskLinkSchema>;
export type UpdateTaskLinkInput = z.infer<typeof updateTaskLinkSchema>;
export type RenameTagInput = z.infer<typeof renameTagSchema>;
export type TagSearchQuery = z.infer<typeof tagSearchQuerySchema>;

// API Token schemas
export const createApiTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100, 'Token name must not exceed 100 characters'),
  scopes: z.array(z.enum(['read', 'write'])).min(1, 'At least one scope is required').max(2)
    .transform(arr => [...new Set(arr)]),
  expiresIn: z.enum(['30d', '90d', '1y']).nullable().optional(),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

// Agent icon options - curated Lucide icons for agent avatars
export const AGENT_ICONS = [
  'bot', 'cpu', 'brain', 'sparkles', 'wand-2', 'zap', 'cog', 'terminal',
  'code', 'cloud', 'globe', 'rocket', 'shield', 'eye', 'star', 'hexagon',
] as const;

// Hex color regex: # followed by exactly 6 hex chars
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g. #8B5CF6)');

// Agent name: letters, numbers, spaces, hyphens, underscores, periods
const agentNameSchema = z.string()
  .min(1, 'Agent name is required')
  .max(50, 'Agent name must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9 _.\-]+$/, 'Agent name can only contain letters, numbers, spaces, hyphens, underscores, and periods');

// Agent token schemas
export const createAgentTokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100, 'Token name must not exceed 100 characters'),
  scopes: z.array(z.enum(['read', 'write'])).min(1, 'At least one scope is required').max(2)
    .transform(arr => [...new Set(arr)]),
  expiresIn: z.enum(['30d', '90d', '1y']).nullable().optional(),
  agentName: agentNameSchema,
  agentIcon: z.enum(AGENT_ICONS).default('bot'),
  agentColor: hexColorSchema.default('#8B5CF6'),
});

export const updateAgentTokenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  agentName: agentNameSchema.optional(),
  agentIcon: z.enum(AGENT_ICONS).optional(),
  agentColor: hexColorSchema.optional(),
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' }
);

export type CreateAgentTokenInput = z.infer<typeof createAgentTokenSchema>;
export type UpdateAgentTokenInput = z.infer<typeof updateAgentTokenSchema>;

// Share schemas
export const createShareSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required').max(255),
  permission: z.enum(['VIEW', 'EDIT']).default('VIEW'),
});

export const updateSharePermissionSchema = z.object({
  permission: z.enum(['VIEW', 'EDIT']),
});

export const shareIdParamSchema = z.object({
  id: z.string().uuid('Invalid note ID format'),
  shareId: z.string().uuid('Invalid share ID format'),
});

export const sharedContactsQuerySchema = z.object({
  q: z.string().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export type CreateShareInput = z.infer<typeof createShareSchema>;
export type UpdateSharePermissionInput = z.infer<typeof updateSharePermissionSchema>;
export type SharedContactsQuery = z.infer<typeof sharedContactsQuerySchema>;

// Feedback schemas
export const FEEDBACK_CATEGORIES = ['ui', 'editor', 'ai', 'organization', 'other'] as const;
export const FEEDBACK_PRIORITIES = ['nice-to-have', 'helpful', 'critical'] as const;

export const createFeedbackSchema = z.object({
  type: z.enum(['BUG', 'FEATURE']),
  title: z.string().min(1, 'Title is required').max(100, 'Title must not exceed 100 characters'),
  description: z.string().min(1, 'Description is required').max(1000, 'Description must not exceed 1000 characters'),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  priority: z.enum(FEEDBACK_PRIORITIES).optional(),
});

export const updateFeedbackSchema = z.object({
  status: z.enum(['NEW', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'DECLINED']).optional(),
  adminNotes: z.string().max(5000).optional(),
});

export const listFeedbackQuerySchema = z.object({
  type: z.enum(['BUG', 'FEATURE']).optional(),
  status: z.enum(['NEW', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'DECLINED']).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

// ─── Webhook schemas ─────────────────────────────────────────────────────────

const WEBHOOK_EVENT_VALUES = [
  'task.created', 'task.updated', 'task.completed', 'task.uncompleted', 'task.deleted',
  'note.created', 'note.updated', 'note.deleted',
  'folder.created', 'folder.updated', 'folder.deleted',
  '*',
] as const;

const webhookEventsSchema = z
  .array(z.string())
  .min(1, 'At least one event is required')
  .max(20, 'Too many events')
  .refine(
    (events) =>
      events.every(
        (e) => WEBHOOK_EVENT_VALUES.includes(e as typeof WEBHOOK_EVENT_VALUES[number]),
      ),
    'Invalid event type — must be a valid event or "*"',
  );

export const createWebhookSchema = z.object({
  url: z.string().url('Invalid URL').max(2048, 'URL too long'),
  events: webhookEventsSchema,
  secret: z.string().min(16, 'Secret must be at least 16 characters').max(256, 'Secret too long'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateWebhookSchema = z.object({
  url: z.string().url('Invalid URL').max(2048, 'URL too long').optional(),
  events: webhookEventsSchema.optional(),
  secret: z.string().min(16, 'Secret must be at least 16 characters').max(256, 'Secret too long').optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const webhookReplaySchema = z.object({
  since: z.string().datetime('Invalid datetime — use ISO 8601'),
  until: z.string().datetime('Invalid datetime — use ISO 8601').optional(),
  eventTypes: z.array(z.string()).max(20).optional(),
});

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(['pending', 'success', 'failed', 'cancelled']).optional(),
  eventType: z.string().optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type WebhookReplayInput = z.infer<typeof webhookReplaySchema>;
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;

import { describe, it, expect } from 'vitest';
import {
  setupSchema,
  loginSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
  createFolderSchema,
  updateFolderSchema,
  FOLDER_ICONS,
  aiConfigSchema,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  listTasksQuerySchema,
  addTaskLinkSchema,
  renameTagSchema,
  createShareSchema,
  updateSharePermissionSchema,
  createFeedbackSchema,
  changeUsernameSchema,
  RESERVED_USERNAMES,
  uuidParamSchema,
  createAgentTokenSchema,
  updateAgentTokenSchema,
  AGENT_ICONS,
  TASK_STATUSES,
} from './validation.schemas.js';

// Helper: expect schema to parse successfully
function expectValid(schema: any, data: any) {
  expect(() => schema.parse(data)).not.toThrow();
}

// Helper: expect schema to reject
function expectInvalid(schema: any, data: any) {
  expect(() => schema.parse(data)).toThrow();
}

describe('validation.schemas', () => {
  // ─── Password Rules ──────────────────────────────────────────────────
  describe('password rules (via setupSchema)', () => {
    const validBase = { username: 'testuser', email: 'test@example.com' };

    it('should accept a valid password', () => {
      expectValid(setupSchema, { ...validBase, password: 'Password1!' });
    });

    it('should reject passwords shorter than 8 characters', () => {
      expectInvalid(setupSchema, { ...validBase, password: 'Pa1!' });
    });

    it('should reject passwords without uppercase', () => {
      expectInvalid(setupSchema, { ...validBase, password: 'password1!' });
    });

    it('should reject passwords without a number', () => {
      expectInvalid(setupSchema, { ...validBase, password: 'Password!' });
    });

    it('should reject passwords without a special character', () => {
      expectInvalid(setupSchema, { ...validBase, password: 'Password1' });
    });
  });

  // ─── Username Rules ───────────────────────────────────────────────────
  describe('username rules (via setupSchema)', () => {
    const validBase = { email: 'test@example.com', password: 'Password1!' };

    it('should accept valid usernames', () => {
      expectValid(setupSchema, { ...validBase, username: 'user_name-1' });
      expectValid(setupSchema, { ...validBase, username: 'abc' });
    });

    it('should reject usernames shorter than 3 chars', () => {
      expectInvalid(setupSchema, { ...validBase, username: 'ab' });
    });

    it('should reject usernames with spaces', () => {
      expectInvalid(setupSchema, { ...validBase, username: 'user name' });
    });

    it('should reject usernames with special characters', () => {
      expectInvalid(setupSchema, { ...validBase, username: 'user@name' });
    });

    it('should reject usernames longer than 50 chars', () => {
      expectInvalid(setupSchema, { ...validBase, username: 'a'.repeat(51) });
    });
  });

  // ─── loginSchema ──────────────────────────────────────────────────────
  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      expectValid(loginSchema, { usernameOrEmail: 'user', password: 'pass' });
    });

    it('should reject empty usernameOrEmail', () => {
      expectInvalid(loginSchema, { usernameOrEmail: '', password: 'pass' });
    });

    it('should reject empty password', () => {
      expectInvalid(loginSchema, { usernameOrEmail: 'user', password: '' });
    });
  });

  // ─── changePasswordSchema ─────────────────────────────────────────────
  describe('changePasswordSchema', () => {
    it('should accept valid data', () => {
      expectValid(changePasswordSchema, {
        currentPassword: 'old',
        newPassword: 'NewPass1!',
      });
    });

    it('should reject weak new password', () => {
      expectInvalid(changePasswordSchema, {
        currentPassword: 'old',
        newPassword: 'weak',
      });
    });
  });

  // ─── createUserSchema ─────────────────────────────────────────────────
  describe('createUserSchema', () => {
    it('should accept valid user with default role', () => {
      const result = createUserSchema.parse({
        username: 'newuser',
        email: 'new@test.com',
        password: 'Password1!',
      });
      expect(result.role).toBe('user');
    });

    it('should accept admin role', () => {
      const result = createUserSchema.parse({
        username: 'admin1',
        email: 'admin@test.com',
        password: 'Password1!',
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    it('should reject invalid role', () => {
      expectInvalid(createUserSchema, {
        username: 'user1',
        email: 'u@test.com',
        password: 'Password1!',
        role: 'superadmin',
      });
    });

    it('should require password for regular users', () => {
      expectInvalid(createUserSchema, {
        username: 'user1',
        email: 'u@test.com',
      });
    });

    it('should reject password when isServiceAccount is true', () => {
      expectInvalid(createUserSchema, {
        username: 'bot1',
        email: 'bot@test.com',
        password: 'Password1!',
        isServiceAccount: true,
      });
    });

    it('should accept service account without password', () => {
      const result = createUserSchema.parse({
        username: 'bot1',
        email: 'bot@test.com',
        isServiceAccount: true,
      });
      expect(result.isServiceAccount).toBe(true);
      expect(result.password).toBeUndefined();
    });

    it('should reject service account with admin role', () => {
      expectInvalid(createUserSchema, {
        username: 'bot1',
        email: 'bot@test.com',
        isServiceAccount: true,
        role: 'admin',
      });
    });

    it('should accept service account with token config fields', () => {
      const result = createUserSchema.parse({
        username: 'bot1',
        email: 'bot@test.com',
        isServiceAccount: true,
        tokenName: 'CI Pipeline',
        tokenScopes: ['read', 'write'],
        tokenExpiresIn: '90d',
      });
      expect(result.tokenName).toBe('CI Pipeline');
      expect(result.tokenScopes).toEqual(['read', 'write']);
      expect(result.tokenExpiresIn).toBe('90d');
    });

    it('should accept service account without email', () => {
      const result = createUserSchema.parse({
        username: 'bot2',
        isServiceAccount: true,
      });
      expect(result.isServiceAccount).toBe(true);
      expect(result.email).toBeUndefined();
    });

    it('should reject regular user without email with specific message', () => {
      try {
        createUserSchema.parse({
          username: 'user2',
          password: 'Password1!',
        });
        expect.fail('Should have thrown');
      } catch (err: any) {
        const issues = err.issues || err.errors;
        const emailIssue = issues.find((i: any) => i.path?.includes('email'));
        expect(emailIssue).toBeDefined();
        expect(emailIssue.message).toBe('Email is required for regular users');
      }
    });

    it('should reject reserved usernames', () => {
      expectInvalid(createUserSchema, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'Password1!',
      });
      expectInvalid(createUserSchema, {
        username: 'System',
        email: 'system@example.com',
        password: 'Password1!',
      });
    });
  });

  // ─── Password reset schemas ───────────────────────────────────────────
  describe('password reset schemas', () => {
    it('forgotPasswordSchema should accept valid email', () => {
      expectValid(forgotPasswordSchema, { email: 'user@example.com' });
    });

    it('forgotPasswordSchema should reject invalid email', () => {
      expectInvalid(forgotPasswordSchema, { email: 'not-an-email' });
    });

    it('resetPasswordSchema should accept valid token and password', () => {
      expectValid(resetPasswordSchema, {
        token: 'some-token-value',
        newPassword: 'NewPass1!',
      });
    });

    it('resetPasswordSchema should reject empty token', () => {
      expectInvalid(resetPasswordSchema, {
        token: '',
        newPassword: 'NewPass1!',
      });
    });

    it('adminResetPasswordSchema should validate password strength', () => {
      expectValid(adminResetPasswordSchema, { newPassword: 'StrongPass1!' });
      expectInvalid(adminResetPasswordSchema, { newPassword: 'weak' });
    });
  });

  // ─── Note schemas ─────────────────────────────────────────────────────
  describe('createNoteSchema', () => {
    it('should accept a note with just a title', () => {
      expectValid(createNoteSchema, { title: 'My Note' });
    });

    it('should accept a note with all fields', () => {
      expectValid(createNoteSchema, {
        title: 'My Note',
        content: 'Some content',
        folderId: '550e8400-e29b-41d4-a716-446655440000',
        tags: ['tag1', 'tag2'],
      });
    });

    it('should reject empty title', () => {
      expectInvalid(createNoteSchema, { title: '' });
    });

    it('should reject title exceeding 500 chars', () => {
      expectInvalid(createNoteSchema, { title: 'A'.repeat(501) });
    });

    it('should reject invalid folderId (non-UUID)', () => {
      expectInvalid(createNoteSchema, { title: 'Test', folderId: 'not-a-uuid' });
    });
  });

  describe('updateNoteSchema', () => {
    it('should accept partial updates', () => {
      expectValid(updateNoteSchema, { title: 'Updated' });
      expectValid(updateNoteSchema, { content: 'New content' });
      expectValid(updateNoteSchema, {});
    });

    it('should allow null folderId (unfiling a note)', () => {
      expectValid(updateNoteSchema, { folderId: null });
    });
  });

  describe('listNotesQuerySchema', () => {
    it('should apply defaults for limit and offset', () => {
      const result = listNotesQuerySchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should coerce string numbers', () => {
      const result = listNotesQuerySchema.parse({ limit: '10', offset: '5' });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('should reject limit over 100', () => {
      expectInvalid(listNotesQuerySchema, { limit: '101' });
    });

    it('should handle folderId=null string', () => {
      const result = listNotesQuerySchema.parse({ folderId: 'null' });
      expect(result.folderId).toBeNull();
    });
  });

  // ─── Folder schemas ───────────────────────────────────────────────────
  describe('createFolderSchema', () => {
    it('should accept folder with just a name', () => {
      const result = createFolderSchema.parse({ name: 'Work' });
      expect(result.name).toBe('Work');
    });

    it('should accept folder with a valid icon', () => {
      expectValid(createFolderSchema, { name: 'Work', icon: 'briefcase' });
    });

    it('should reject folder with invalid icon', () => {
      expectInvalid(createFolderSchema, { name: 'Work', icon: 'nonexistent-icon' });
    });

    it('should reject empty folder name', () => {
      expectInvalid(createFolderSchema, { name: '' });
    });

    it('should reject name over 255 chars', () => {
      expectInvalid(createFolderSchema, { name: 'A'.repeat(256) });
    });
  });

  describe('FOLDER_ICONS', () => {
    it('should contain the default folder icon', () => {
      expect(FOLDER_ICONS).toContain('folder');
    });

    it('should contain all v1.3.0 icons that caused the past bug', () => {
      // These were the icons added that broke validation — ensure they're present
      const v130Icons = [
        'gamepad-2', 'trophy', 'swords', 'dice-5', 'dollar-sign',
        'credit-card', 'graduation-cap', 'brain', 'flask-conical',
        'dumbbell', 'mountain', 'tree-pine', 'plane', 'mail',
        'message-circle', 'lock', 'shield', 'headphones', 'tv', 'wrench',
      ];
      for (const icon of v130Icons) {
        expect(FOLDER_ICONS).toContain(icon);
      }
    });

    it('should accept every icon in FOLDER_ICONS through the schema', () => {
      for (const icon of FOLDER_ICONS) {
        expectValid(createFolderSchema, { name: 'Test', icon });
      }
    });
  });

  // ─── Task schemas ─────────────────────────────────────────────────────
  describe('createTaskSchema', () => {
    it('should accept a task with just a title', () => {
      expectValid(createTaskSchema, { title: 'Buy groceries' });
    });

    it('should accept a full task', () => {
      expectValid(createTaskSchema, {
        title: 'Deploy app',
        description: 'Deploy to production',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueDate: '2026-03-01T00:00:00.000Z',
        noteId: '550e8400-e29b-41d4-a716-446655440000',
        folderId: '550e8400-e29b-41d4-a716-446655440000',
        tags: ['deploy', 'prod'],
        links: [{ url: 'https://example.com', title: 'Docs' }],
      });
    });

    it('should reject invalid status enum', () => {
      expectInvalid(createTaskSchema, { title: 'Test', status: 'DONE' });
    });

    it('should reject invalid priority enum', () => {
      expectInvalid(createTaskSchema, { title: 'Test', priority: 'EXTREME' });
    });

    it('should reject more than 10 links', () => {
      const links = Array.from({ length: 11 }, (_, i) => ({
        url: `https://example.com/${i}`,
      }));
      expectInvalid(createTaskSchema, { title: 'Test', links });
    });
  });

  // ─── Safe URL schema (via addTaskLinkSchema) ─────────────────────────
  describe('safe URL validation (via addTaskLinkSchema)', () => {
    it('should accept https URLs', () => {
      expectValid(addTaskLinkSchema, { url: 'https://example.com/page' });
    });

    it('should accept http URLs', () => {
      expectValid(addTaskLinkSchema, { url: 'http://example.com/page' });
    });

    it('should reject javascript: URLs', () => {
      expectInvalid(addTaskLinkSchema, { url: 'javascript:alert(1)' });
    });

    it('should reject data: URLs', () => {
      expectInvalid(addTaskLinkSchema, { url: 'data:text/html,<h1>XSS</h1>' });
    });

    it('should reject ftp: URLs', () => {
      expectInvalid(addTaskLinkSchema, { url: 'ftp://files.example.com/file' });
    });

    it('should reject file: URLs', () => {
      expectInvalid(addTaskLinkSchema, { url: 'file:///etc/passwd' });
    });

    it('should reject URLs longer than 2048 chars', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2040);
      expectInvalid(addTaskLinkSchema, { url: longUrl });
    });

    it('should reject non-URL strings', () => {
      expectInvalid(addTaskLinkSchema, { url: 'not a url at all' });
    });
  });

  // ─── Share schemas ────────────────────────────────────────────────────
  describe('createShareSchema', () => {
    it('should accept valid share with VIEW permission', () => {
      expectValid(createShareSchema, {
        usernameOrEmail: 'bob@test.com',
        permission: 'VIEW',
      });
    });

    it('should accept valid share with EDIT permission', () => {
      expectValid(createShareSchema, {
        usernameOrEmail: 'bob',
        permission: 'EDIT',
      });
    });

    it('should default to VIEW permission', () => {
      const result = createShareSchema.parse({ usernameOrEmail: 'bob' });
      expect(result.permission).toBe('VIEW');
    });

    it('should reject invalid permission', () => {
      expectInvalid(createShareSchema, {
        usernameOrEmail: 'bob',
        permission: 'ADMIN',
      });
    });

    it('should reject empty usernameOrEmail', () => {
      expectInvalid(createShareSchema, { usernameOrEmail: '' });
    });
  });

  describe('updateSharePermissionSchema', () => {
    it('should accept VIEW', () => {
      expectValid(updateSharePermissionSchema, { permission: 'VIEW' });
    });

    it('should accept EDIT', () => {
      expectValid(updateSharePermissionSchema, { permission: 'EDIT' });
    });

    it('should reject invalid permission', () => {
      expectInvalid(updateSharePermissionSchema, { permission: 'OWNER' });
    });
  });

  // ─── AI schemas ───────────────────────────────────────────────────────
  describe('aiConfigSchema', () => {
    it('should accept valid config', () => {
      expectValid(aiConfigSchema, { provider: 'anthropic', apiKey: 'sk-test' });
      expectValid(aiConfigSchema, { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4' });
      expectValid(aiConfigSchema, { provider: 'gemini', apiKey: 'key' });
    });

    it('should reject invalid provider', () => {
      expectInvalid(aiConfigSchema, { provider: 'groq', apiKey: 'key' });
    });

    it('should reject empty apiKey', () => {
      expectInvalid(aiConfigSchema, { provider: 'openai', apiKey: '' });
    });
  });

  // ─── Feedback schemas ─────────────────────────────────────────────────
  describe('createFeedbackSchema', () => {
    it('should accept valid feedback', () => {
      expectValid(createFeedbackSchema, {
        type: 'BUG',
        title: 'Editor crashes',
        description: 'When I paste an image the editor freezes',
      });
    });

    it('should accept feedback with category and priority', () => {
      expectValid(createFeedbackSchema, {
        type: 'FEATURE',
        title: 'Dark mode',
        description: 'Would love dark mode support',
        category: 'ui',
        priority: 'helpful',
      });
    });

    it('should reject invalid type', () => {
      expectInvalid(createFeedbackSchema, {
        type: 'QUESTION',
        title: 'Test',
        description: 'Test',
      });
    });

    it('should reject title over 100 chars', () => {
      expectInvalid(createFeedbackSchema, {
        type: 'BUG',
        title: 'A'.repeat(101),
        description: 'Test',
      });
    });

    it('should reject description over 1000 chars', () => {
      expectInvalid(createFeedbackSchema, {
        type: 'BUG',
        title: 'Test',
        description: 'A'.repeat(1001),
      });
    });
  });

  // ─── UUID param schema ────────────────────────────────────────────────
  describe('uuidParamSchema', () => {
    it('should accept a valid UUID', () => {
      expectValid(uuidParamSchema, { id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('should reject a non-UUID string', () => {
      expectInvalid(uuidParamSchema, { id: 'not-a-uuid' });
    });

    it('should reject a numeric ID', () => {
      expectInvalid(uuidParamSchema, { id: '12345' });
    });
  });

  // ─── Tag schemas ──────────────────────────────────────────────────────
  describe('renameTagSchema', () => {
    it('should accept a valid tag name', () => {
      expectValid(renameTagSchema, { name: 'javascript' });
    });

    it('should reject empty name', () => {
      expectInvalid(renameTagSchema, { name: '' });
    });

    it('should reject name over 100 chars', () => {
      expectInvalid(renameTagSchema, { name: 'A'.repeat(101) });
    });
  });

  // ─── updateTaskStatusSchema ───────────────────────────────────────────
  describe('updateTaskStatusSchema', () => {
    it('should accept all valid statuses', () => {
      for (const status of ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) {
        expectValid(updateTaskStatusSchema, { status });
      }
    });

    it('should reject invalid status', () => {
      expectInvalid(updateTaskStatusSchema, { status: 'DONE' });
    });
  });

  // ─── listTasksQuerySchema ─────────────────────────────────────────────
  describe('listTasksQuerySchema', () => {
    it('should apply defaults', () => {
      const result = listTasksQuerySchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should accept array of statuses', () => {
      const result = listTasksQuerySchema.parse({
        status: ['PENDING', 'IN_PROGRESS'],
      });
      expect(result.status).toEqual(['PENDING', 'IN_PROGRESS']);
    });

    it('should accept single status string', () => {
      const result = listTasksQuerySchema.parse({ status: 'COMPLETED' });
      expect(result.status).toBe('COMPLETED');
    });

    it('should coerce boolean for overdue', () => {
      const result = listTasksQuerySchema.parse({ overdue: 'true' });
      expect(result.overdue).toBe(true);
    });
  });

  // ─── Task schema extensions (WAITING, sync identity, startDate, subtasks) ──
  describe('task schema extensions', () => {
    const UUID = '550e8400-e29b-41d4-a716-446655440000';

    it('TASK_STATUSES lists all five statuses, WAITING included', () => {
      expect([...TASK_STATUSES]).toEqual(['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED']);
    });

    it('accepts WAITING in the create, update, status and list schemas', () => {
      expectValid(createTaskSchema, { title: 'T', status: 'WAITING' });
      expectValid(updateTaskSchema, { status: 'WAITING' });
      expectValid(updateTaskStatusSchema, { status: 'WAITING' });
      expect(listTasksQuerySchema.parse({ status: 'WAITING' }).status).toBe('WAITING');
      expect(listTasksQuerySchema.parse({ status: ['PENDING', 'WAITING'] }).status).toEqual(['PENDING', 'WAITING']);
    });

    it('accepts the new fields on create', () => {
      const parsed = createTaskSchema.parse({
        title: 'T',
        waitingOn: 'the notary',
        source: 'foyer',
        externalId: 'proposal-123',
        startDate: '2026-10-20T00:00:00.000Z',
        dueDate: '2026-10-21T00:00:00.000Z',
        parentTaskId: UUID,
      });
      expect(parsed).toMatchObject({
        waitingOn: 'the notary',
        source: 'foyer',
        externalId: 'proposal-123',
        startDate: '2026-10-20T00:00:00.000Z',
        parentTaskId: UUID,
      });
    });

    it('refuses source without externalId and externalId without source', () => {
      expectInvalid(createTaskSchema, { title: 'T', source: 'foyer' });
      expectInvalid(createTaskSchema, { title: 'T', externalId: 'x' });
    });

    it('enforces the source pattern', () => {
      expectValid(createTaskSchema, { title: 'T', source: 'github_issues-2', externalId: 'x' });
      expectInvalid(createTaskSchema, { title: 'T', source: 'Foyer', externalId: 'x' });
      expectInvalid(createTaskSchema, { title: 'T', source: '1foyer', externalId: 'x' });
      expectInvalid(createTaskSchema, { title: 'T', source: 'f', externalId: 'x' });
      expectInvalid(createTaskSchema, { title: 'T', source: 'a'.repeat(51), externalId: 'x' });
      expectInvalid(createTaskSchema, { title: 'T', source: 'foy er', externalId: 'x' });
    });

    it('bounds externalId and waitingOn', () => {
      expectInvalid(createTaskSchema, { title: 'T', source: 'foyer', externalId: '' });
      expectInvalid(createTaskSchema, { title: 'T', source: 'foyer', externalId: 'x'.repeat(256) });
      expectInvalid(createTaskSchema, { title: 'T', waitingOn: 'x'.repeat(256) });
    });

    it('refuses startDate after dueDate on create and update', () => {
      const bad = { startDate: '2026-10-22T00:00:00.000Z', dueDate: '2026-10-21T00:00:00.000Z' };
      expectInvalid(createTaskSchema, { title: 'T', ...bad });
      expectInvalid(updateTaskSchema, bad);
      expectValid(createTaskSchema, { title: 'T', startDate: '2026-10-21T00:00:00.000Z', dueDate: '2026-10-21T00:00:00.000Z' });
    });

    it('requires startDate to be an ISO datetime', () => {
      expectInvalid(createTaskSchema, { title: 'T', startDate: 'next week' });
      expectInvalid(createTaskSchema, { title: 'T', startDate: '2026-10-21' });
    });

    it('requires parentTaskId to be a UUID', () => {
      expectInvalid(createTaskSchema, { title: 'T', parentTaskId: 'not-a-uuid' });
      expectInvalid(updateTaskSchema, { parentTaskId: 'not-a-uuid' });
    });

    it('lets update clear startDate, waitingOn and parentTaskId with null', () => {
      const parsed = updateTaskSchema.parse({ startDate: null, waitingOn: null, parentTaskId: null });
      expect(parsed).toMatchObject({ startDate: null, waitingOn: null, parentTaskId: null });
    });

    it('refuses source and externalId on update', () => {
      const result = updateTaskSchema.safeParse({ source: 'foyer', externalId: 'x' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('source and externalId are set at creation');
      }
      expectInvalid(updateTaskSchema, { externalId: 'x' });
    });

    it('list query accepts source, externalId, parentTaskId and sortBy startDate', () => {
      const parsed = listTasksQuerySchema.parse({
        source: 'foyer',
        externalId: 'x',
        parentTaskId: UUID,
        sortBy: 'startDate',
      });
      expect(parsed).toMatchObject({ source: 'foyer', externalId: 'x', parentTaskId: UUID, sortBy: 'startDate' });
    });

    it('list query refuses externalId without source', () => {
      expectInvalid(listTasksQuerySchema, { externalId: 'x' });
    });

    it('list query caps offset at 100000', () => {
      expect(listTasksQuerySchema.parse({ offset: '100000' }).offset).toBe(100000);
      expectInvalid(listTasksQuerySchema, { offset: '100001' });
    });
  });

  // ─── changeUsernameSchema ─────────────────────────────────────────────
  describe('changeUsernameSchema', () => {
    it('should accept a valid username', () => {
      expectValid(changeUsernameSchema, { username: 'new-user_123' });
    });

    it('should accept minimum-length username (3 chars)', () => {
      expectValid(changeUsernameSchema, { username: 'abc' });
    });

    it('should reject username shorter than 3 characters', () => {
      expectInvalid(changeUsernameSchema, { username: 'ab' });
    });

    it('should reject username with invalid characters', () => {
      expectInvalid(changeUsernameSchema, { username: 'user name' });
      expectInvalid(changeUsernameSchema, { username: 'user@name' });
      expectInvalid(changeUsernameSchema, { username: 'user.name' });
    });

    it('should reject username exceeding 50 characters', () => {
      expectInvalid(changeUsernameSchema, { username: 'a'.repeat(51) });
    });

    it('should reject empty username', () => {
      expectInvalid(changeUsernameSchema, { username: '' });
    });

    it('should reject missing username field', () => {
      expectInvalid(changeUsernameSchema, {});
    });

    it('should reject reserved usernames (case-insensitive)', () => {
      expectInvalid(changeUsernameSchema, { username: 'admin' });
      expectInvalid(changeUsernameSchema, { username: 'Admin' });
      expectInvalid(changeUsernameSchema, { username: 'SYSTEM' });
      expectInvalid(changeUsernameSchema, { username: 'root' });
      expectInvalid(changeUsernameSchema, { username: 'notez' });
    });
  });

  // ─── Agent Token Schemas ────────────────────────────────────────────
  describe('createAgentTokenSchema', () => {
    const validAgentToken = {
      name: 'Claude Desktop',
      scopes: ['read', 'write'],
      agentName: 'Claude',
      agentIcon: 'bot',
      agentColor: '#8B5CF6',
    };

    it('should accept valid agent token data', () => {
      expectValid(createAgentTokenSchema, validAgentToken);
    });

    it('should require agentName', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: undefined });
    });

    it('should reject empty agentName', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: '' });
    });

    it('should reject agentName over 50 chars', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: 'A'.repeat(51) });
    });

    it('should accept agentName with allowed characters', () => {
      expectValid(createAgentTokenSchema, { ...validAgentToken, agentName: 'Claude 3.5 - Desktop' });
      expectValid(createAgentTokenSchema, { ...validAgentToken, agentName: 'my_agent_v2' });
    });

    it('should reject agentName with special characters', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: '<script>alert(1)</script>' });
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: 'Claude & Friends' });
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentName: 'Agent "X"' });
    });

    it('should accept all valid agent icons', () => {
      for (const icon of AGENT_ICONS) {
        expectValid(createAgentTokenSchema, { ...validAgentToken, agentIcon: icon });
      }
    });

    it('should reject invalid agent icon', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentIcon: 'invalid-icon' });
    });

    it('should accept valid hex colors', () => {
      expectValid(createAgentTokenSchema, { ...validAgentToken, agentColor: '#000000' });
      expectValid(createAgentTokenSchema, { ...validAgentToken, agentColor: '#FFFFFF' });
      expectValid(createAgentTokenSchema, { ...validAgentToken, agentColor: '#abcdef' });
    });

    it('should reject invalid hex colors', () => {
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentColor: 'red' });
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentColor: '#fff' });
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentColor: '#GGGGGG' });
      expectInvalid(createAgentTokenSchema, { ...validAgentToken, agentColor: '8B5CF6' });
    });

    it('should default agentIcon to bot and agentColor to #8B5CF6', () => {
      const result = createAgentTokenSchema.parse({
        name: 'Test',
        scopes: ['read'],
        agentName: 'Agent',
      });
      expect(result.agentIcon).toBe('bot');
      expect(result.agentColor).toBe('#8B5CF6');
    });

    it('should deduplicate scopes', () => {
      const result = createAgentTokenSchema.parse({
        ...validAgentToken,
        scopes: ['read', 'read'],
      });
      expect(result.scopes).toEqual(['read']);
    });
  });

  describe('updateAgentTokenSchema', () => {
    it('should accept partial updates', () => {
      expectValid(updateAgentTokenSchema, { agentName: 'New Name' });
      expectValid(updateAgentTokenSchema, { agentIcon: 'sparkles' });
      expectValid(updateAgentTokenSchema, { agentColor: '#EC4899' });
      expectValid(updateAgentTokenSchema, { name: 'New Token Name' });
    });

    it('should reject empty update (no fields)', () => {
      expectInvalid(updateAgentTokenSchema, {});
    });

    it('should reject invalid icon in update', () => {
      expectInvalid(updateAgentTokenSchema, { agentIcon: 'not-valid' });
    });

    it('should reject invalid color in update', () => {
      expectInvalid(updateAgentTokenSchema, { agentColor: 'blue' });
    });
  });
});

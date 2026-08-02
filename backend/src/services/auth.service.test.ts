import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock prisma
vi.mock('../lib/db.js', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock email service
vi.mock('./email.service.js', () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
    sendPasswordChangedEmail: vi.fn().mockResolvedValue(true),
  },
}));

import {
  hashPassword,
  verifyPassword,
  isFirstUser,
  setupFirstUser,
  login,
  refreshAccessToken,
  logout,
  changePassword,
  cleanupExpiredSessions,
  requestPasswordReset,
  validateResetToken,
} from './auth.service.js';
import { prisma } from '../lib/db.js';
import { emailService } from './email.service.js';

const mockPrisma = vi.mocked(prisma);

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── hashPassword / verifyPassword ────────────────────────────────────
  describe('hashPassword / verifyPassword', () => {
    it('should hash a password and verify it correctly', async () => {
      const password = 'MySecret123!';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const hash = await hashPassword('CorrectPassword1!');
      expect(await verifyPassword('WrongPassword1!', hash)).toBe(false);
    });

    it('should produce different hashes for the same password (salt)', async () => {
      const hash1 = await hashPassword('Same1!');
      const hash2 = await hashPassword('Same1!');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ─── isFirstUser ──────────────────────────────────────────────────────
  describe('isFirstUser', () => {
    it('should return true when no users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      expect(await isFirstUser()).toBe(true);
    });

    it('should return false when users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      expect(await isFirstUser()).toBe(false);
    });
  });

  // ─── setupFirstUser ───────────────────────────────────────────────────
  describe('setupFirstUser', () => {
    const setupData = {
      username: 'admin',
      email: 'admin@test.com',
      password: 'Admin123!',
    };

    it('should throw if setup is already completed', async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(setupFirstUser(setupData)).rejects.toThrow(
        'Setup has already been completed'
      );
    });

    it('should throw if username or email already exists', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing' } as any);

      await expect(setupFirstUser(setupData)).rejects.toThrow(
        'Username or email already exists'
      );
    });

    it('should create admin user and return tokens', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        email: 'admin@test.com',
        role: 'admin',
        passwordHash: 'hashed',
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      const result = await setupFirstUser(setupData);

      expect(result.user.username).toBe('admin');
      expect(result.user.role).toBe('admin');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'admin',
            isActive: true,
          }),
        })
      );
    });
  });

  // ─── login ────────────────────────────────────────────────────────────
  describe('login', () => {
    it('should throw for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        login({ usernameOrEmail: 'nobody', password: 'Pass1!' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw for service accounts (prevents password login)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'sa-1',
        isActive: true,
        isServiceAccount: true,
        passwordHash: 'some-hash',
      } as any);

      await expect(
        login({ usernameOrEmail: 'bot-agent', password: 'Pass1!' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw for deactivated user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        isActive: false,
        isServiceAccount: false,
        passwordHash: 'hash',
      } as any);

      await expect(
        login({ usernameOrEmail: 'inactive', password: 'Pass1!' })
      ).rejects.toThrow('Account is deactivated');
    });

    it('should throw for wrong password', async () => {
      const hash = await hashPassword('CorrectPass1!');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        passwordHash: hash,
      } as any);

      await expect(
        login({ usernameOrEmail: 'user', password: 'WrongPass1!' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should return user and tokens for valid credentials', async () => {
      const hash = await hashPassword('GoodPass1!');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        email: 'alice@test.com',
        role: 'user',
        isActive: true,
        passwordHash: hash,
        mustChangePassword: false,
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      const result = await login({
        usernameOrEmail: 'alice',
        password: 'GoodPass1!',
      });

      expect(result.user.username).toBe('alice');
      expect(result.user.role).toBe('user');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should normalize email for case-insensitive lookup', async () => {
      const hash = await hashPassword('Pass1!');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        email: 'alice@test.com',
        role: 'user',
        isActive: true,
        passwordHash: hash,
        mustChangePassword: false,
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      await login({ usernameOrEmail: 'Alice@Test.Com', password: 'Pass1!' });

      // Verify the query used the lowercased email
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                email: { equals: 'alice@test.com', mode: 'insensitive' },
              }),
            ]),
          }),
        })
      );
    });
  });

  // ─── refreshAccessToken ───────────────────────────────────────────────
  describe('refreshAccessToken', () => {
    it('should throw for invalid refresh token JWT', async () => {
      await expect(refreshAccessToken('invalid-jwt')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should throw if session not found in database', async () => {
      // Generate a real refresh token first
      const { login: loginFn } = await import('./auth.service.js');
      const { generateTokenPair } = await import('../utils/jwt.utils.js');
      const tokens = generateTokenPair({
        userId: 'user-1',
        username: 'test',
        role: 'user',
      });

      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(refreshAccessToken(tokens.refreshToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    it('should throw if session is expired', async () => {
      const { generateTokenPair } = await import('../utils/jwt.utils.js');
      const tokens = generateTokenPair({
        userId: 'user-1',
        username: 'test',
        role: 'user',
      });

      const pastDate = new Date('2020-01-01');
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        expiresAt: pastDate,
        user: { id: 'user-1', isActive: true },
      } as any);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 } as any);

      await expect(refreshAccessToken(tokens.refreshToken)).rejects.toThrow(
        'Refresh token expired'
      );
    });

    it('should throw if user account is deactivated', async () => {
      const { generateTokenPair } = await import('../utils/jwt.utils.js');
      const tokens = generateTokenPair({
        userId: 'user-1',
        username: 'test',
        role: 'user',
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        expiresAt: futureDate,
        user: {
          id: 'user-1',
          username: 'test',
          email: 'test@test.com',
          role: 'user',
          isActive: false,
          mustChangePassword: false,
        },
      } as any);

      await expect(refreshAccessToken(tokens.refreshToken)).rejects.toThrow(
        'Account is deactivated'
      );
    });

    it('should return new tokens for valid refresh', async () => {
      const { generateTokenPair } = await import('../utils/jwt.utils.js');
      const tokens = generateTokenPair({
        userId: 'user-1',
        username: 'test',
        role: 'user',
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        expiresAt: futureDate,
        user: {
          id: 'user-1',
          username: 'test',
          email: 'test@test.com',
          role: 'user',
          isActive: true,
          mustChangePassword: false,
        },
      } as any);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await refreshAccessToken(tokens.refreshToken);
      expect(result.user.username).toBe('test');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────
  describe('logout', () => {
    it('should do nothing if session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      await expect(logout('non-existent-token')).resolves.toBeUndefined();
      expect(mockPrisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete all sessions for the user', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        userId: 'user-1',
      } as any);
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 3 } as any);

      await logout('some-refresh-token');

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────
  describe('changePassword', () => {
    it('should throw if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        changePassword('user-1', {
          currentPassword: 'Old1!',
          newPassword: 'New1!aaa',
        })
      ).rejects.toThrow('User not found');
    });

    it('should throw for service accounts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'sa-1',
        isServiceAccount: true,
        passwordHash: 'some-hash',
      } as any);

      await expect(
        changePassword('sa-1', {
          currentPassword: 'Old1!',
          newPassword: 'New1!aaa',
        })
      ).rejects.toThrow('Service accounts do not use passwords');
    });

    it('should throw if current password is wrong', async () => {
      const hash = await hashPassword('RealPassword1!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isServiceAccount: false,
        passwordHash: hash,
      } as any);

      await expect(
        changePassword('user-1', {
          currentPassword: 'WrongPassword1!',
          newPassword: 'NewPassword1!',
        })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should update password and invalidate sessions on success', async () => {
      const hash = await hashPassword('OldPassword1!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: hash,
      } as any);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await changePassword('user-1', {
        currentPassword: 'OldPassword1!',
        newPassword: 'NewPassword1!',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── cleanupExpiredSessions ───────────────────────────────────────────
  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions and return count', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 5 } as any);

      const count = await cleanupExpiredSessions();
      expect(count).toBe(5);
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  // ─── requestPasswordReset ─────────────────────────────────────────────
  describe('requestPasswordReset', () => {
    it('should silently return if user not found (prevent email enumeration)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        requestPasswordReset('nonexistent@test.com')
      ).resolves.toBeUndefined();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should silently return for inactive user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        isActive: false,
      } as any);

      await expect(
        requestPasswordReset('inactive@test.com')
      ).resolves.toBeUndefined();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should create token and send email for valid user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'alice@test.com',
        username: 'alice',
        isActive: true,
      } as any);
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      } as any);
      mockPrisma.passwordResetToken.create.mockResolvedValue({} as any);

      await requestPasswordReset('alice@test.com');

      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'alice@test.com',
        'alice',
        expect.any(String) // raw token
      );
    });

    it('should invalidate existing reset tokens before creating new one', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'alice@test.com',
        username: 'alice',
        isActive: true,
      } as any);
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      } as any);
      mockPrisma.passwordResetToken.create.mockResolvedValue({} as any);

      await requestPasswordReset('alice@test.com');

      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });
  });

  // ─── validateResetToken ───────────────────────────────────────────────
  describe('validateResetToken', () => {
    it('should return false if token not found', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
      expect(await validateResetToken('any-token')).toBe(false);
    });

    it('should return false if token has been used', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      } as any);
      expect(await validateResetToken('used-token')).toBe(false);
    });

    it('should return false if token is expired', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        usedAt: null,
        expiresAt: new Date('2020-01-01'),
      } as any);
      expect(await validateResetToken('expired-token')).toBe(false);
    });

    it('should return true for valid unused non-expired token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        usedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
      } as any);
      expect(await validateResetToken('valid-token')).toBe(true);
    });
  });

  // ─── refresh token storage ────────────────────────────────────────────
  // Sessions must persist only a SHA-256 digest. Storing the raw JWT would make
  // any database read (leaked backup, restic archive) directly replayable
  // against /api/auth/refresh.
  describe('refresh token storage', () => {
    const sha256 = (value: string) =>
      crypto.createHash('sha256').update(value).digest('hex');

    it('should store a hash of the refresh token on login, never the token itself', async () => {
      const hash = await hashPassword('GoodPass1!');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        username: 'alice',
        email: 'alice@test.com',
        role: 'user',
        isActive: true,
        passwordHash: hash,
        mustChangePassword: false,
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      const result = await login({
        usernameOrEmail: 'alice',
        password: 'GoodPass1!',
      });

      const stored = mockPrisma.session.create.mock.calls[0][0].data as any;
      expect(stored.refreshTokenHash).toBe(sha256(result.tokens.refreshToken));
      expect(stored.refreshTokenHash).toHaveLength(64);
      // The raw token must not appear anywhere in the persisted row
      expect(JSON.stringify(stored)).not.toContain(result.tokens.refreshToken);
    });

    it('should store a hash of the refresh token during first-user setup', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        username: 'admin',
        email: 'admin@test.com',
        role: 'admin',
      } as any);
      mockPrisma.session.create.mockResolvedValue({} as any);

      const result = await setupFirstUser({
        username: 'admin',
        email: 'admin@test.com',
        password: 'AdminPass1!',
      } as any);

      const stored = mockPrisma.session.create.mock.calls[0][0].data as any;
      expect(stored.refreshTokenHash).toBe(sha256(result.tokens.refreshToken));
      expect(JSON.stringify(stored)).not.toContain(result.tokens.refreshToken);
    });

    it('should look up sessions by hash, not by raw token', async () => {
      const { generateTokenPair } = await import('../utils/jwt.utils.js');
      const tokens = generateTokenPair({
        userId: 'user-1',
        username: 'alice',
        role: 'user',
      });
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(refreshAccessToken(tokens.refreshToken)).rejects.toThrow();

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { refreshTokenHash: sha256(tokens.refreshToken) },
        })
      );
    });

    it('should look up the session by hash on logout', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await logout('some-refresh-token');

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { refreshTokenHash: sha256('some-refresh-token') },
        })
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';

// PASSWORD_LOGIN_ENABLED=false: Pocket ID is the only way in. The password endpoints refuse
// before touching any account, and everything else (SSO, refresh, /auth/me) keeps working.

vi.mock('../lib/db.js', () => ({ prisma: { user: { findUnique: vi.fn() } } }));

vi.mock('../services/auth.service.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  validateResetToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  createUserSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../middleware/auth.middleware.js', () => ({
  authenticateToken: async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization !== 'Bearer valid') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    request.user = { userId: 'u1', username: 'pam', role: 'user' };
  },
}));

vi.mock('../services/oidc.service.js', async () => {
  class OidcLoginError extends Error {
    constructor(public readonly code: string, message?: string) {
      super(message ?? code);
    }
  }
  return {
    OIDC_PROVIDER_NAME: 'Pocket ID',
    OidcLoginError,
    isOidcEnabled: vi.fn(),
    isPasswordLoginEnabled: vi.fn(),
    getOidcSettings: vi.fn(),
    beginLogin: vi.fn(),
    completeLogin: vi.fn(),
    resolveOidcUser: vi.fn(),
    linkOidcToUser: vi.fn(),
  };
});

import { authRoutes } from './auth.routes.js';
import * as oidcService from '../services/oidc.service.js';
import * as authService from '../services/auth.service.js';
import { prisma } from '../lib/db.js';

const mockOidc = vi.mocked(oidcService);
const mockAuth = vi.mocked(authService);
const mockPrisma = vi.mocked(prisma);

const bearer = { authorization: 'Bearer valid' };

describe('PASSWORD_LOGIN_ENABLED', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOidc.getOidcSettings.mockReturnValue(null);
    mockOidc.isOidcEnabled.mockReturnValue(true);
    app = Fastify({ trustProxy: true });
    await app.register(cookie, { secret: 'test-cookie-signing-key-0123456789' });
    await app.register(authRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('off', () => {
    beforeEach(() => {
      mockOidc.isPasswordLoginEnabled.mockReturnValue(false);
    });

    it('the login page config says so, so the page shows only the Pocket ID button', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/config' });
      expect(res.json()).toEqual({
        enabled: true,
        providerName: 'Pocket ID',
        passwordLoginEnabled: false,
      });
    });

    function expectRefused(res: Awaited<ReturnType<FastifyInstance['inject']>>) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: 'Forbidden',
        code: 'password_login_disabled',
      });
      expect(res.json().message).toMatch(/Pocket ID/);
    }

    it('password login is refused without checking the account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { usernameOrEmail: 'pam', password: 'whatever-it-is' },
      });
      expectRefused(res);
      expect(mockAuth.login).not.toHaveBeenCalled();
    });

    it('is refused before body validation (no hint about what a valid body looks like)', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
      expectRefused(res);
    });

    it('forgot-password is refused and sends no email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'pam@example.com' },
      });
      expectRefused(res);
      expect(mockAuth.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('reset-password is refused, so an old emailed link cannot set a password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'a'.repeat(64), newPassword: 'Str0ng-enough-Passw0rd!' },
      });
      expectRefused(res);
      expect(mockAuth.resetPassword).not.toHaveBeenCalled();
    });

    it('validate-reset-token is refused too', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/auth/validate-reset-token?token=${'a'.repeat(64)}`,
      });
      expectRefused(res);
      expect(mockAuth.validateResetToken).not.toHaveBeenCalled();
    });

    it('change-password is refused for a signed-in user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: bearer,
        payload: { currentPassword: 'old-one', newPassword: 'Str0ng-enough-Passw0rd!' },
      });
      expectRefused(res);
      expect(mockAuth.changePassword).not.toHaveBeenCalled();
    });

    it('/auth/me never asks for a password change (the forced page would be a dead end)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'pam',
        email: 'pam@example.com',
        role: 'user',
        isServiceAccount: false,
        mustChangePassword: true,
        oidcSubject: 'sub-pam',
      } as never);

      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer });

      expect(res.statusCode).toBe(200);
      expect(res.json().user.mustChangePassword).toBe(false);
    });

    it('leaves Pocket ID sign-in alone', async () => {
      mockOidc.beginLogin.mockResolvedValue({
        url: 'https://id.example.com/authorize?x=1',
        transaction: { state: 's', nonce: 'n', codeVerifier: 'v' },
      });
      const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('https://id.example.com/authorize?x=1');
    });

    it('leaves session refresh alone', async () => {
      mockAuth.refreshAccessToken.mockResolvedValue({
        user: { id: 'u1' },
        tokens: { accessToken: 'at', refreshToken: 'rt' },
      } as never);
      const signed = app.signCookie('rt-old');
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: signed },
      });
      expect(res.statusCode).toBe(200);
      expect(mockAuth.refreshAccessToken).toHaveBeenCalledWith('rt-old');
    });
  });

  describe('on (the default)', () => {
    beforeEach(() => {
      mockOidc.isPasswordLoginEnabled.mockReturnValue(true);
    });

    it('the config reports it', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/config' });
      expect(res.json().passwordLoginEnabled).toBe(true);
    });

    it('password login works as before', async () => {
      mockAuth.login.mockResolvedValue({
        user: { id: 'u1', username: 'pam' },
        tokens: { accessToken: 'at', refreshToken: 'rt' },
      } as never);
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { usernameOrEmail: 'pam', password: 'whatever-it-is' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockAuth.login).toHaveBeenCalledTimes(1);
    });

    it('/auth/me still reports a pending password change', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'pam',
        email: 'pam@example.com',
        role: 'user',
        isServiceAccount: false,
        mustChangePassword: true,
        oidcSubject: null,
      } as never);
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer });
      expect(res.json().user.mustChangePassword).toBe(true);
    });

    it('change-password works as before', async () => {
      mockAuth.changePassword.mockResolvedValue(undefined as never);
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: bearer,
        payload: { currentPassword: 'old-one', newPassword: 'Str0ng-enough-Passw0rd!' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockAuth.changePassword).toHaveBeenCalledTimes(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

vi.mock('../lib/db.js', () => ({ prisma: { user: { findUnique: vi.fn() } } }));

vi.mock('../services/auth.service.js', () => ({
  createUserSession: vi.fn(),
  logout: vi.fn(),
}));

// The real middleware has its own tests; here only "has a bearer token or not" matters
vi.mock('../middleware/auth.middleware.js', () => ({
  authenticateToken: async (request: any, reply: any) => {
    if (request.headers.authorization !== 'Bearer valid') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    request.user = { userId: 'admin1', username: 'adam', role: 'admin' };
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

const tx = { state: 's', nonce: 'n', codeVerifier: 'v' };

describe('SSO routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(cookie, { secret: 'test-cookie-signing-key-0123456789' });
    await app.register(authRoutes, { prefix: '/api' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  /** Start a login and return the signed transaction cookie the browser would hold */
  async function startLogin(): Promise<string> {
    mockOidc.beginLogin.mockResolvedValue({ url: 'https://id.example.com/authorize?x=1', transaction: tx });
    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
    const txCookie = res.cookies.find((c) => c.name === 'oidc_tx');
    expect(txCookie).toBeDefined();
    return txCookie!.value;
  }

  it('reports whether SSO is enabled', async () => {
    mockOidc.isOidcEnabled.mockReturnValue(true);
    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/config' });
    expect(res.json()).toEqual({ enabled: true, providerName: 'Pocket ID' });
  });

  it('login redirects to the provider with an httpOnly, short-lived transaction cookie', async () => {
    mockOidc.beginLogin.mockResolvedValue({ url: 'https://id.example.com/authorize?x=1', transaction: tx });

    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://id.example.com/authorize?x=1');
    const txCookie = res.cookies.find((c) => c.name === 'oidc_tx')!;
    expect(txCookie.httpOnly).toBe(true);
    expect(txCookie.path).toBe('/');
    expect(txCookie.domain).toBeUndefined();
    expect(txCookie.sameSite).toBe('Lax');
    expect(txCookie.maxAge).toBe(600);
  });

  it('in production the transaction cookie is a host-only __Host- cookie (no cookie tossing)', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockOidc.beginLogin.mockResolvedValue({ url: 'https://id.example.com/authorize', transaction: tx });
      const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });

      const txCookie = res.cookies.find((c) => c.name === '__Host-oidc_tx')!;
      expect(txCookie).toBeDefined();
      expect(txCookie.secure).toBe(true);
      expect(txCookie.path).toBe('/');
      expect(txCookie.domain).toBeUndefined();

      // A same-named cookie without the prefix (as a sibling subdomain could set) is ignored
      const tossed = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=c&state=s',
        cookies: { oidc_tx: txCookie.value },
      });
      expect(tossed.headers.location).toBe('/login?sso_error=expired');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('link requires a signed-in user', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/oidc/link' });

    expect(res.statusCode).toBe(401);
    expect(mockOidc.beginLogin).not.toHaveBeenCalled();
  });

  it('link starts a flow bound to the signed-in user and returns the provider URL', async () => {
    mockOidc.beginLogin.mockResolvedValue({
      url: 'https://id.example.com/authorize?y=1',
      transaction: { ...tx, linkUserId: 'admin1' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link',
      headers: { authorization: 'Bearer valid' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ url: 'https://id.example.com/authorize?y=1' });
    expect(mockOidc.beginLogin).toHaveBeenCalledWith('admin1');
    expect(res.cookies.find((c) => c.name === 'oidc_tx')).toBeDefined();
  });

  /** Run a Connect through the provider callback; returns the signed pending-link cookie */
  async function callbackForLink(sub: string): Promise<{ location: string; pending: string }> {
    mockOidc.beginLogin.mockResolvedValue({
      url: 'https://id.example.com/authorize',
      transaction: { ...tx, linkUserId: 'admin1' },
    });
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link',
      headers: { authorization: 'Bearer valid' },
    });
    const signedTx = start.cookies.find((c) => c.name === 'oidc_tx')!.value;
    mockOidc.completeLogin.mockResolvedValue({ sub });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: signedTx },
    });
    return {
      location: res.headers.location as string,
      pending: res.cookies.find((c) => c.name === 'oidc_link')?.value ?? '',
    };
  }

  it('a link callback does NOT link: it holds the identity and sends Settings to confirm', async () => {
    const { location, pending } = await callbackForLink('sub-adam');

    expect(location).toBe('/settings/profile?sso_link=confirm');
    expect(pending).not.toBe('');
    expect(mockOidc.linkOidcToUser).not.toHaveBeenCalled();
    expect(mockOidc.resolveOidcUser).not.toHaveBeenCalled();
    expect(mockAuth.createUserSession).not.toHaveBeenCalled();
  });

  it('confirm links the pending identity to the signed-in user who started it', async () => {
    const { pending } = await callbackForLink('sub-adam');
    mockOidc.linkOidcToUser.mockResolvedValue({ id: 'admin1' } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      headers: { authorization: 'Bearer valid' },
      cookies: { oidc_link: pending },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ linked: true });
    expect(mockOidc.linkOidcToUser).toHaveBeenCalledWith('admin1', { sub: 'sub-adam' });
    expect(res.cookies.find((c) => c.name === 'oidc_link')!.value).toBe('');
  });

  it('confirm rejects a forged (unsigned) pending link', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      headers: { authorization: 'Bearer valid' },
      cookies: { oidc_link: JSON.stringify({ userId: 'admin1', sub: 'sub-intruder' }) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('expired');
    expect(mockOidc.linkOidcToUser).not.toHaveBeenCalled();
  });

  it('confirm by a different signed-in user is refused (shared-browser replay)', async () => {
    // A validly signed pending link started by another account
    mockOidc.beginLogin.mockResolvedValue({
      url: 'https://id.example.com/authorize',
      transaction: { ...tx, linkUserId: 'someone-else' },
    });
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link',
      headers: { authorization: 'Bearer valid' },
    });
    const signedTx = start.cookies.find((c) => c.name === 'oidc_tx')!.value;
    mockOidc.completeLogin.mockResolvedValue({ sub: 'sub-intruder' });
    const cb = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: signedTx },
    });
    const pendingForOther = cb.cookies.find((c) => c.name === 'oidc_link')!.value;

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      headers: { authorization: 'Bearer valid' }, // signed in as admin1
      cookies: { oidc_link: pendingForOther },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('not_allowed');
    expect(mockOidc.linkOidcToUser).not.toHaveBeenCalled();
  });

  it('confirm without a pending link is rejected as expired', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      headers: { authorization: 'Bearer valid' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('expired');
    expect(mockOidc.linkOidcToUser).not.toHaveBeenCalled();
  });

  it('confirm requires a signed-in user', async () => {
    const { pending } = await callbackForLink('sub-adam');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      cookies: { oidc_link: pending },
    });

    expect(res.statusCode).toBe(401);
    expect(mockOidc.linkOidcToUser).not.toHaveBeenCalled();
  });

  it('a refused confirm returns the reason code as a 409, never a 500', async () => {
    const { pending } = await callbackForLink('sub-x');
    mockOidc.linkOidcToUser.mockRejectedValue(new (oidcService.OidcLoginError as any)('conflict'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link/confirm',
      headers: { authorization: 'Bearer valid' },
      cookies: { oidc_link: pending },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict');
  });

  it('a link callback the provider refused reports its reason on the Settings page', async () => {
    mockOidc.beginLogin.mockResolvedValue({
      url: 'https://id.example.com/authorize',
      transaction: { ...tx, linkUserId: 'admin1' },
    });
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/oidc/link',
      headers: { authorization: 'Bearer valid' },
    });
    const signed = start.cookies.find((c) => c.name === 'oidc_tx')!.value;
    mockOidc.completeLogin.mockRejectedValue(new (oidcService.OidcLoginError as any)('not_allowed'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: signed },
    });

    expect(res.headers.location).toBe('/settings/profile?sso_error=not_allowed');
  });

  it('in production the callback deletes the __Host- cookie with Secure (or the browser ignores it)', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=c&state=s' });

      const cleared = res.cookies.find((c) => c.name === '__Host-oidc_tx')!;
      expect(cleared).toBeDefined();
      expect(cleared.value).toBe('');
      expect(cleared.secure).toBe(true);
      expect(cleared.path).toBe('/');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('logout drops any half-finished SSO sign-in or Connect', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: 'Bearer valid' },
    });

    expect(res.statusCode).toBe(200);
    const names = res.cookies.filter((c) => c.value === '').map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['oidc_tx', 'oidc_link']));
  });

  it('/me reports whether the account is linked without exposing the subject', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin1',
      username: 'adam',
      email: 'a@example.com',
      role: 'admin',
      isServiceAccount: false,
      mustChangePassword: false,
      oidcSubject: 'sub-adam',
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: 'Bearer valid' },
    });

    expect(res.json().user.oidcLinked).toBe(true);
    expect(res.body).not.toContain('sub-adam');
    expect(res.json().user).not.toHaveProperty('oidcSubject');
  });

  it('login failure sends the user back to the login page with a reason', async () => {
    mockOidc.beginLogin.mockRejectedValue(new Error('discovery down'));

    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?sso_error=unavailable');
  });

  it('callback without the transaction cookie is rejected as expired', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=c&state=s' });

    expect(res.headers.location).toBe('/login?sso_error=expired');
    expect(mockOidc.completeLogin).not.toHaveBeenCalled();
  });

  it('callback with a tampered transaction cookie is rejected as expired', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: JSON.stringify(tx) }, // unsigned: forged by the client
    });

    expect(res.headers.location).toBe('/login?sso_error=expired');
    expect(mockOidc.completeLogin).not.toHaveBeenCalled();
  });

  it('callback with a provider error reports cancelled', async () => {
    const signed = await startLogin();
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?error=access_denied&state=s',
      cookies: { oidc_tx: signed },
    });

    expect(res.headers.location).toBe('/login?sso_error=cancelled');
    expect(mockOidc.completeLogin).not.toHaveBeenCalled();
  });

  it('successful callback sets the refresh cookie, clears the transaction and redirects', async () => {
    const signed = await startLogin();
    mockOidc.completeLogin.mockResolvedValue({ sub: 'sub-pam', email: 'pam@example.com', emailVerified: true });
    mockOidc.resolveOidcUser.mockResolvedValue({ id: 'u1', username: 'pam', role: 'user' } as any);
    mockAuth.createUserSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: signed },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?sso=complete');
    expect(mockOidc.completeLogin).toHaveBeenCalledWith('?code=c&state=s', tx);
    expect(mockAuth.createUserSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));

    const refresh = res.cookies.find((c) => c.name === 'refreshToken')!;
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.path).toBe('/');
    const cleared = res.cookies.find((c) => c.name === 'oidc_tx')!;
    expect(cleared.value).toBe('');
  });

  it('a refused identity maps to its reason code and issues no session', async () => {
    const signed = await startLogin();
    mockOidc.completeLogin.mockResolvedValue({ sub: 'sub-x' });
    mockOidc.resolveOidcUser.mockRejectedValue(new (oidcService.OidcLoginError as any)('conflict'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=s',
      cookies: { oidc_tx: signed },
    });

    expect(res.headers.location).toBe('/login?sso_error=conflict');
    expect(mockAuth.createUserSession).not.toHaveBeenCalled();
    expect(res.cookies.find((c) => c.name === 'refreshToken')).toBeUndefined();
  });

  it('an unexpected failure (e.g. bad state) reports a generic failure and issues no session', async () => {
    const signed = await startLogin();
    mockOidc.completeLogin.mockRejectedValue(new Error('state mismatch'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=c&state=wrong',
      cookies: { oidc_tx: signed },
    });

    expect(res.headers.location).toBe('/login?sso_error=failed');
    expect(mockAuth.createUserSession).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('./email.service.js', () => ({ emailService: {} }));

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ fake: 'config' })),
  randomState: vi.fn(() => 'state-1'),
  randomNonce: vi.fn(() => 'nonce-1'),
  randomPKCECodeVerifier: vi.fn(() => 'verifier-1'),
  calculatePKCECodeChallenge: vi.fn(async () => 'challenge-1'),
  buildAuthorizationUrl: vi.fn(
    (_config: unknown, params: Record<string, string>) =>
      new URL(`https://id.example.com/authorize?${new URLSearchParams(params)}`)
  ),
  authorizationCodeGrant: vi.fn(),
}));

import {
  resolveOidcUser,
  linkOidcToUser,
  beginLogin,
  completeLogin,
  resetOidcClientCache,
  sanitizeUsername,
  getOidcSettings,
  OidcLoginError,
} from './oidc.service.js';
import { prisma } from '../lib/db.js';
import * as oidcClient from 'openid-client';

const mockPrisma = vi.mocked(prisma);
const mockClient = vi.mocked(oidcClient);

const OIDC_ENV = {
  OIDC_ISSUER: 'https://id.example.com',
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 'test-client-value',
  APP_URL: 'https://notez.example.com',
};

function setOidcEnv(extra: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...OIDC_ENV, ...extra })) {
    process.env[key] = value;
  }
  resetOidcClientCache();
}

function clearOidcEnv() {
  for (const key of [...Object.keys(OIDC_ENV), 'OIDC_REQUIRED_GROUP']) {
    delete process.env[key];
  }
  resetOidcClientCache();
}

function grantReturning(claims: Record<string, unknown> | undefined) {
  mockClient.authorizationCodeGrant.mockResolvedValue({ claims: () => claims } as any);
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'pam',
    email: 'pam@example.com',
    role: 'user',
    isActive: true,
    isServiceAccount: false,
    oidcSubject: null,
    mustChangePassword: false,
    ...overrides,
  } as any;
}

const identity = {
  sub: 'sub-pam',
  email: 'Pam@Example.com',
  emailVerified: true,
  preferredUsername: 'pam',
};

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(OidcLoginError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('oidc.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveOidcUser: already linked', () => {
    it('returns the user linked to the subject without touching email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user({ oidcSubject: 'sub-pam' }));

      const result = await resolveOidcUser(identity);

      expect(result.id).toBe('u1');
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('signs in a linked user even if the provider email later changes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user({ oidcSubject: 'sub-pam' }));

      const result = await resolveOidcUser({ ...identity, email: 'new@example.com' });

      expect(result.id).toBe('u1');
    });

    it('refuses a linked deactivated user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user({ oidcSubject: 'sub-pam', isActive: false }));
      await expectCode(resolveOidcUser(identity), 'deactivated');
    });

    it('refuses a linked service account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        user({ oidcSubject: 'sub-pam', isServiceAccount: true })
      );
      await expectCode(resolveOidcUser(identity), 'not_allowed');
    });
  });

  describe('resolveOidcUser: link by email', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
    });

    it('links an unlinked account with the same verified email, case-insensitively', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user()]);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await resolveOidcUser(identity);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: { equals: 'pam@example.com', mode: 'insensitive' } },
        })
      );
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', oidcSubject: null },
        data: { oidcSubject: 'sub-pam' },
      });
      expect(result.oidcSubject).toBe('sub-pam');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses when the provider email is not verified', async () => {
      await expectCode(resolveOidcUser({ ...identity, emailVerified: false }), 'unverified_email');
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses when the provider sends no email', async () => {
      await expectCode(resolveOidcUser({ ...identity, email: undefined }), 'unverified_email');
    });

    it('never re-links an account already linked to a different subject', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user({ oidcSubject: 'sub-someone-else' })]);

      await expectCode(resolveOidcUser(identity), 'conflict');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('never links an admin account by email (must connect from Settings)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user({ role: 'admin' })]);

      await expectCode(resolveOidcUser(identity), 'link_required');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses to link a service account by email', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user({ isServiceAccount: true })]);

      await expectCode(resolveOidcUser(identity), 'not_allowed');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to link a deactivated account by email', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user({ isActive: false })]);

      await expectCode(resolveOidcUser(identity), 'deactivated');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to guess when two accounts differ only by email case', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        user({ id: 'a', email: 'pam@example.com' }),
        user({ id: 'b', email: 'Pam@example.com' }),
      ]);

      await expectCode(resolveOidcUser(identity), 'conflict');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('reports a conflict if another callback linked the account first', async () => {
      mockPrisma.user.findMany.mockResolvedValue([user()]);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expectCode(resolveOidcUser(identity), 'conflict');
    });
  });

  describe('resolveOidcUser: auto-create', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.create.mockImplementation((async ({ data }: any) => ({ id: 'new', ...data })) as any);
    });

    it('creates a regular, non-admin user linked to the subject', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await resolveOidcUser({ ...identity, preferredUsername: 'newbie' });

      const data = mockPrisma.user.create.mock.calls[0][0].data as any;
      expect(data.role).toBe('user');
      expect(data.oidcSubject).toBe('sub-pam');
      expect(data.email).toBe('pam@example.com');
      expect(data.username).toBe('newbie');
      expect(data.mustChangePassword).toBe(false);
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/); // a real bcrypt hash of a random value
      expect(result.id).toBe('new');
    });

    it('adds a numeric suffix when the username is taken', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({ id: 'x' } as any) // newbie taken
        .mockResolvedValueOnce(null); // newbie-2 free

      await resolveOidcUser({ ...identity, preferredUsername: 'newbie' });

      expect((mockPrisma.user.create.mock.calls[0][0].data as any).username).toBe('newbie-2');
    });

    it('never claims a reserved username, whatever its case', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await resolveOidcUser({ ...identity, preferredUsername: 'Admin' });

      expect((mockPrisma.user.create.mock.calls[0][0].data as any).username).toBe('Admin-2');
    });

    it('falls back to the email local part when there is no preferred username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await resolveOidcUser({ ...identity, preferredUsername: undefined });

      expect((mockPrisma.user.create.mock.calls[0][0].data as any).username).toBe('pam');
    });

    it('maps a unique-constraint race to a conflict', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

      await expectCode(resolveOidcUser(identity), 'conflict');
    });
  });

  describe('linkOidcToUser (signed-in connect)', () => {
    it('links an admin who is signed in, without needing an email match', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(user({ id: 'admin1', role: 'admin' })) // the signed-in user
        .mockResolvedValueOnce(null); // sub not linked elsewhere
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await linkOidcToUser('admin1', { sub: 'sub-adam' });

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'admin1', oidcSubject: null },
        data: { oidcSubject: 'sub-adam' },
      });
      expect(result.oidcSubject).toBe('sub-adam');
    });

    it('is a no-op when already linked to the same subject', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(user({ oidcSubject: 'sub-pam' }));

      await linkOidcToUser('u1', { sub: 'sub-pam' });

      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses when the user is linked to a different subject', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(user({ oidcSubject: 'sub-old' }));

      await expectCode(linkOidcToUser('u1', { sub: 'sub-new' }), 'conflict');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses when the subject already belongs to another account', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(user())
        .mockResolvedValueOnce(user({ id: 'other', oidcSubject: 'sub-pam' }));

      await expectCode(linkOidcToUser('u1', { sub: 'sub-pam' }), 'conflict');
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses service accounts and deactivated users', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(user({ isServiceAccount: true }));
      await expectCode(linkOidcToUser('u1', { sub: 's' }), 'not_allowed');

      mockPrisma.user.findUnique.mockResolvedValueOnce(user({ isActive: false }));
      await expectCode(linkOidcToUser('u1', { sub: 's' }), 'deactivated');
    });

    it('maps a unique-constraint race on the subject to a conflict', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(user()).mockResolvedValueOnce(null);
      mockPrisma.user.updateMany.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

      await expectCode(linkOidcToUser('u1', { sub: 'sub-pam' }), 'conflict');
    });
  });

  describe('beginLogin', () => {
    afterEach(clearOidcEnv);

    it('refuses when SSO is not configured', async () => {
      clearOidcEnv();
      await expectCode(beginLogin(), 'not_configured');
    });

    it('discovers the configured issuer with a bounded timeout', async () => {
      setOidcEnv();
      await beginLogin();

      const [server, clientId, secret, , options] = mockClient.discovery.mock.calls[0] as any[];
      expect(server.href).toBe('https://id.example.com/');
      expect(clientId).toBe('client-1');
      expect(secret).toBe('test-client-value');
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(15);
    });

    it('requests a PKCE S256 code with state and nonce, to the APP_URL callback', async () => {
      setOidcEnv();
      const { url, transaction } = await beginLogin();

      const params = new URL(url).searchParams;
      expect(params.get('redirect_uri')).toBe('https://notez.example.com/api/auth/oidc/callback');
      expect(params.get('state')).toBe('state-1');
      expect(params.get('nonce')).toBe('nonce-1');
      expect(params.get('code_challenge')).toBe('challenge-1');
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.get('scope')).toBe('openid profile email');
      expect(transaction).toEqual({ state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' });
    });

    it('asks for groups when a required group is configured', async () => {
      setOidcEnv({ OIDC_REQUIRED_GROUP: 'notez_users' });
      const { url } = await beginLogin();

      expect(new URL(url).searchParams.get('scope')).toBe('openid profile email groups');
    });

    it('carries the signed-in user id for a link flow', async () => {
      setOidcEnv();
      const { transaction } = await beginLogin('u1');
      expect(transaction.linkUserId).toBe('u1');
    });
  });

  describe('completeLogin', () => {
    const tx = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };

    afterEach(clearOidcEnv);

    it('validates state, nonce, PKCE and the ID token against the APP_URL callback', async () => {
      setOidcEnv();
      grantReturning({ sub: 'sub-pam', email: 'pam@example.com', email_verified: true, preferred_username: 'pam' });

      const result = await completeLogin('?code=abc&state=state-1', tx);

      const [, callbackUrl, checks] = mockClient.authorizationCodeGrant.mock.calls[0] as any[];
      expect(callbackUrl.href).toBe(
        'https://notez.example.com/api/auth/oidc/callback?code=abc&state=state-1'
      );
      expect(checks).toEqual({
        pkceCodeVerifier: 'verifier-1',
        expectedState: 'state-1',
        expectedNonce: 'nonce-1',
        idTokenExpected: true,
      });
      expect(result).toEqual({
        sub: 'sub-pam',
        email: 'pam@example.com',
        emailVerified: true,
        preferredUsername: 'pam',
      });
    });

    it('treats a non-boolean email_verified as unverified', async () => {
      setOidcEnv();
      grantReturning({ sub: 's', email: 'a@example.com', email_verified: 'true' });

      expect((await completeLogin('?code=abc', tx)).emailVerified).toBe(false);
    });

    it('rejects a token response without an ID token subject', async () => {
      setOidcEnv();
      grantReturning(undefined);
      await expectCode(completeLogin('?code=abc', tx), 'invalid_claims');

      grantReturning({ sub: '' });
      await expectCode(completeLogin('?code=abc', tx), 'invalid_claims');
    });

    it('rejects a user outside the required group', async () => {
      setOidcEnv({ OIDC_REQUIRED_GROUP: 'notez_users' });
      grantReturning({ sub: 's', groups: ['declare_users'] });

      await expectCode(completeLogin('?code=abc', tx), 'not_allowed');
    });

    it('rejects when the groups claim is missing but a group is required', async () => {
      setOidcEnv({ OIDC_REQUIRED_GROUP: 'notez_users' });
      grantReturning({ sub: 's' });

      await expectCode(completeLogin('?code=abc', tx), 'not_allowed');
    });

    it('accepts a member of the required group', async () => {
      setOidcEnv({ OIDC_REQUIRED_GROUP: 'notez_users' });
      grantReturning({ sub: 's', groups: ['cogg_haus', 'notez_users'] });

      expect((await completeLogin('?code=abc', tx)).sub).toBe('s');
    });

    it('propagates a state or nonce mismatch from openid-client', async () => {
      setOidcEnv();
      mockClient.authorizationCodeGrant.mockRejectedValue(new Error('unexpected "state" response parameter value'));

      await expect(completeLogin('?code=abc&state=forged', tx)).rejects.toThrow(/state/);
    });
  });

  describe('sanitizeUsername', () => {
    it('strips characters outside the username rules', () => {
      expect(sanitizeUsername('pam.smith+notes')).toBe('pamsmithnotes');
    });

    it('pads names shorter than 3 characters', () => {
      expect(sanitizeUsername('al')).toBe('useral');
      expect(sanitizeUsername('')).toBe('user');
      expect(sanitizeUsername(undefined)).toBe('user');
    });

    it('caps length so a suffix still fits in 50 characters', () => {
      expect(sanitizeUsername('a'.repeat(80))).toHaveLength(40);
    });
  });

  describe('getOidcSettings', () => {
    const full = {
      OIDC_ISSUER: 'https://id.example.com',
      OIDC_CLIENT_ID: 'cid',
      OIDC_CLIENT_SECRET: 'csecret',
      APP_URL: 'https://notez.example.com',
    };

    it('derives the callback from APP_URL', () => {
      expect(getOidcSettings(full)?.redirectUri).toBe(
        'https://notez.example.com/api/auth/oidc/callback'
      );
    });

    it('is disabled (not a crash) when APP_URL or the issuer is not an absolute URL', () => {
      expect(getOidcSettings({ ...full, APP_URL: 'notez.example.com' })).toBeNull();
      expect(getOidcSettings({ ...full, OIDC_ISSUER: 'id.example.com' })).toBeNull();
    });

    it('is disabled when any setting is missing', () => {
      for (const key of Object.keys(full)) {
        expect(getOidcSettings({ ...full, [key]: '' })).toBeNull();
      }
    });
  });
});

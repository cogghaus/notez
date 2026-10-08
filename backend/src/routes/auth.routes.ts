import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as authService from '../services/auth.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  setupSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../utils/validation.schemas.js';
import { prisma } from '../lib/db.js';
import * as oidcService from '../services/oidc.service.js';
import type { OidcTransaction } from '../services/oidc.service.js';

// __Host- in production: the browser refuses a Domain attribute, so a sibling
// *.cogg.haus host cannot plant its own transaction cookie (login CSRF by cookie
// tossing). The prefix requires Secure and Path=/, so plain-http dev uses a bare name.
const isProduction = () => process.env.NODE_ENV === 'production';
const oidcTxCookie = () => (isProduction() ? '__Host-oidc_tx' : 'oidc_tx');
// Holds a verified provider identity between the provider's redirect and the signed-in
// confirm call that actually links it (see /auth/oidc/link/confirm)
const oidcLinkCookie = () => (isProduction() ? '__Host-oidc_link' : 'oidc_link');

// A __Host- cookie is only accepted, and only deleted, when the Set-Cookie carries
// Secure and Path=/, so every set and clear goes through these options.
const oidcCookieBase = () => ({
  httpOnly: true,
  secure: isProduction(),
  // lax: the cookie must ride along on the provider's top-level redirect back
  sameSite: 'lax' as const,
  path: '/',
});

function clearOidcCookies(reply: FastifyReply): void {
  reply.clearCookie(oidcTxCookie(), oidcCookieBase());
  reply.clearCookie(oidcLinkCookie(), oidcCookieBase());
}

interface PendingLink {
  userId: string;
  sub: string;
}

function parsePendingLink(raw: string | undefined): PendingLink | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingLink>;
    if (typeof parsed.userId === 'string' && typeof parsed.sub === 'string' && parsed.sub) {
      return { userId: parsed.userId, sub: parsed.sub };
    }
  } catch {
    // fall through
  }
  return null;
}

// SSO endpoints are browser redirects, keyed by IP only
const oidcRateLimitConfig = {
  max: 20,
  timeWindow: '15 minutes',
};

function parseTransaction(raw: string | undefined): OidcTransaction | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OidcTransaction>;
    if (
      typeof parsed.state === 'string' &&
      typeof parsed.nonce === 'string' &&
      typeof parsed.codeVerifier === 'string' &&
      (parsed.linkUserId === undefined || typeof parsed.linkUserId === 'string')
    ) {
      return parsed as OidcTransaction;
    }
  } catch {
    // fall through
  }
  return null;
}

function setTransactionCookie(reply: FastifyReply, transaction: OidcTransaction): void {
  reply.setCookie(oidcTxCookie(), JSON.stringify(transaction), {
    ...oidcCookieBase(),
    maxAge: 10 * 60,
    signed: true,
  });
}

// Rate limit configuration for auth endpoints
// These are stricter than the global rate limit to prevent brute force attacks
const authRateLimitConfig = {
  max: 5, // 5 attempts
  timeWindow: '15 minutes', // per 15 minutes
  // Use IP + attempted username/email as key for login-related endpoints
  keyGenerator: (request: FastifyRequest) => {
    const body = request.body as { username?: string; email?: string } | undefined;
    const identifier = body?.username || body?.email || '';
    return `${request.ip}:${identifier}`;
  },
};

// Stricter rate limit for password reset (prevent email enumeration timing attacks)
const passwordResetRateLimitConfig = {
  max: 3, // 3 attempts
  timeWindow: '1 hour', // per hour - stricter for password reset
  keyGenerator: (request: FastifyRequest) => {
    return request.ip;
  },
};

export async function authRoutes(fastify: FastifyInstance) {
  // Check if setup is needed
  fastify.get('/auth/setup-needed', async (_request, reply) => {
    try {
      const isFirst = await authService.isFirstUser();
      return { setupNeeded: isFirst };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to check setup status',
      });
    }
  });

  // Initial setup - create first admin user
  fastify.post(
    '/auth/setup',
    {
      preHandler: validateBody(setupSchema),
    },
    async (request, reply) => {
      try {
        const result = await authService.setupFirstUser(request.body as any);

        // Set refresh token as httpOnly cookie
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
          path: '/',
          signed: true,
        });

        return {
          message: 'Setup completed successfully',
          user: result.user,
          accessToken: result.tokens.accessToken,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error) {
          if (error.message.includes('already')) {
            return reply.status(409).send({
              error: 'Conflict',
              message: error.message,
            });
          }
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to complete setup',
        });
      }
    }
  );

  // Login
  fastify.post(
    '/auth/login',
    {
      config: {
        rateLimit: authRateLimitConfig,
      },
      preHandler: validateBody(loginSchema),
    },
    async (request, reply) => {
      try {
        const result = await authService.login(request.body as any);

        // Set refresh token as httpOnly cookie
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
          signed: true,
        });

        return {
          message: 'Login successful',
          user: result.user,
          accessToken: result.tokens.accessToken,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error) {
          if (
            error.message.includes('Invalid credentials') ||
            error.message.includes('deactivated')
          ) {
            return reply.status(401).send({
              error: 'Unauthorized',
              message: error.message,
            });
          }
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Login failed',
        });
      }
    }
  );

  // ─── Single sign-on (Pocket ID / OIDC) ─────────────────────────────────

  // Tells the login page whether to show the SSO button
  fastify.get('/auth/oidc/config', async () => {
    return {
      enabled: oidcService.isOidcEnabled(),
      providerName: oidcService.OIDC_PROVIDER_NAME,
    };
  });

  // Start SSO: remember state/nonce/PKCE in a signed cookie, redirect to the provider
  fastify.get(
    '/auth/oidc/login',
    { config: { rateLimit: oidcRateLimitConfig } },
    async (request, reply) => {
      try {
        const { url, transaction } = await oidcService.beginLogin();
        setTransactionCookie(reply, transaction);
        return reply.redirect(url, 302);
      } catch (error) {
        const code =
          error instanceof oidcService.OidcLoginError ? error.code : 'unavailable';
        request.log.error({ err: error }, 'SSO login start failed');
        return reply.redirect(`/login?sso_error=${code}`, 302);
      }
    }
  );

  // Signed-in user connects their account to the provider (the only way an admin
  // links). XHR with the bearer token; the SPA then navigates to the returned URL.
  fastify.post(
    '/auth/oidc/link',
    {
      preHandler: authenticateToken,
      config: { rateLimit: oidcRateLimitConfig },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }
      try {
        const { url, transaction } = await oidcService.beginLogin(request.user.userId);
        setTransactionCookie(reply, transaction);
        return { url };
      } catch (error) {
        if (error instanceof oidcService.OidcLoginError && error.code === 'not_configured') {
          return reply.status(404).send({ error: 'Not Found', message: 'Single sign-on is not configured' });
        }
        request.log.error({ err: error }, 'SSO link start failed');
        return reply.status(503).send({ error: 'Service Unavailable', message: 'Single sign-on is unavailable' });
      }
    }
  );

  // Provider redirects back here with ?code&state (or ?error)
  fastify.get(
    '/auth/oidc/callback',
    { config: { rateLimit: oidcRateLimitConfig } },
    async (request, reply) => {
      // One-shot: the transaction cookie is cleared whatever happens next
      const cookieName = oidcTxCookie();
      const rawCookie = request.cookies[cookieName];
      reply.clearCookie(cookieName, oidcCookieBase());

      const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
      const transaction =
        unsigned && unsigned.valid ? parseTransaction(unsigned.value ?? undefined) : null;

      // Link attempts return to Settings, sign-ins to the login page
      const isLink = Boolean(transaction?.linkUserId);
      const fail = (code: string) =>
        reply.redirect(`${isLink ? '/settings/profile' : '/login'}?sso_error=${code}`, 302);

      const query = request.query as { error?: string };
      if (query.error) {
        return fail('cancelled');
      }
      if (!transaction) {
        return fail('expired');
      }

      try {
        const queryIndex = request.url.indexOf('?');
        const callbackQuery = queryIndex >= 0 ? request.url.slice(queryIndex) : '';

        const identity = await oidcService.completeLogin(callbackQuery, transaction);

        if (transaction.linkUserId) {
          // Do not link yet. Whoever finished at the provider may not be the person who
          // clicked Connect (shared browser, a replayed authorize URL), so the identity
          // waits in a short-lived signed cookie until the Settings page confirms it with
          // the signed-in user's bearer token (POST /auth/oidc/link/confirm).
          const pending: PendingLink = { userId: transaction.linkUserId, sub: identity.sub };
          reply.setCookie(oidcLinkCookie(), JSON.stringify(pending), {
            ...oidcCookieBase(),
            maxAge: 5 * 60,
            signed: true,
          });
          return reply.redirect('/settings/profile?sso_link=confirm', 302);
        }

        const user = await oidcService.resolveOidcUser(identity);
        const tokens = await authService.createUserSession(user);

        reply.setCookie('refreshToken', tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
          signed: true,
        });

        // The SPA exchanges the refresh cookie for an access token on arrival
        return reply.redirect('/login?sso=complete', 302);
      } catch (error) {
        if (error instanceof oidcService.OidcLoginError) {
          request.log.warn({ code: error.code, reason: error.message }, 'SSO login refused');
          return fail(error.code);
        }
        request.log.error({ err: error }, 'SSO callback failed');
        return fail('failed');
      }
    }
  );

  // Signed-in Settings page completes a Connect: the pending identity is linked only if
  // the bearer token belongs to the same user who started it.
  fastify.post(
    '/auth/oidc/link/confirm',
    {
      preHandler: authenticateToken,
      config: { rateLimit: oidcRateLimitConfig },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      // One-shot, like the transaction cookie
      const cookieName = oidcLinkCookie();
      const rawCookie = request.cookies[cookieName];
      reply.clearCookie(cookieName, oidcCookieBase());

      const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
      const pending =
        unsigned && unsigned.valid ? parsePendingLink(unsigned.value ?? undefined) : null;
      if (!pending) {
        return reply.status(400).send({ error: 'Bad Request', code: 'expired', message: 'No pending connection' });
      }
      if (pending.userId !== request.user.userId) {
        request.log.warn('SSO link confirm by a different user than the one who started it');
        return reply.status(403).send({ error: 'Forbidden', code: 'not_allowed', message: 'Connection was started by another account' });
      }

      try {
        await oidcService.linkOidcToUser(pending.userId, { sub: pending.sub });
        return { linked: true };
      } catch (error) {
        if (error instanceof oidcService.OidcLoginError) {
          request.log.warn({ code: error.code, reason: error.message }, 'SSO link refused');
          return reply.status(409).send({ error: 'Conflict', code: error.code, message: 'Could not connect this account' });
        }
        throw error;
      }
    }
  );

  // Refresh access token
  fastify.post('/auth/refresh', async (request, reply) => {
    try {
      // Get refresh token from cookie
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token not found',
        });
      }

      // Unsign the cookie if using signed cookies
      const token = request.unsignCookie(refreshToken);
      if (!token.valid) {
        // Clear invalid cookie
        reply.clearCookie('refreshToken', { path: '/' });
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid refresh token signature',
        });
      }

      const result = await authService.refreshAccessToken(token.value!);

      // Update refresh token cookie with improved security settings
      reply.setCookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
        signed: true,
      });

      return {
        message: 'Token refreshed successfully',
        user: result.user,
        accessToken: result.tokens.accessToken,
      };
    } catch (error) {
      fastify.log.error(error);

      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('expired')) {
          // Clear invalid/expired cookie
          reply.clearCookie('refreshToken', { path: '/' });
          return reply.status(401).send({
            error: 'Unauthorized',
            message: error.message,
          });
        }
      }

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Token refresh failed',
      });
    }
  });

  // Logout
  fastify.post(
    '/auth/logout',
    {
      preHandler: authenticateToken,
    },
    async (request, reply) => {
      try {
        const refreshToken = request.cookies.refreshToken;

        if (refreshToken) {
          const token = request.unsignCookie(refreshToken);
          if (token.valid && token.value) {
            await authService.logout(token.value);
          }
        }

        // Clear refresh token cookie
        reply.clearCookie('refreshToken', {
          path: '/',
        });
        // Drop any half-finished SSO sign-in or Connect so the next person on this
        // browser cannot complete it
        clearOidcCookies(reply);

        return { message: 'Logout successful' };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Logout failed',
        });
      }
    }
  );

  // Change password
  fastify.post(
    '/auth/change-password',
    {
      preHandler: [authenticateToken, validateBody(changePasswordSchema)],
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        await authService.changePassword(request.user.userId, request.body as any);

        return { message: 'Password changed successfully' };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error) {
          if (error.message.includes('incorrect')) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: error.message,
            });
          }
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to change password',
        });
      }
    }
  );

  // Get current user info
  fastify.get(
    '/auth/me',
    {
      preHandler: authenticateToken,
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Fetch full user details from database
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isServiceAccount: true,
            mustChangePassword: true,
            oidcSubject: true,
          },
        });

        if (!user) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return {
          user: {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isServiceAccount: user.isServiceAccount,
            mustChangePassword: user.mustChangePassword,
            oidcLinked: user.oidcSubject !== null, // the subject itself is not exposed
          },
        };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user info',
        });
      }
    }
  );

  // Request password reset
  fastify.post(
    '/auth/forgot-password',
    {
      config: {
        rateLimit: passwordResetRateLimitConfig,
      },
      preHandler: validateBody(forgotPasswordSchema),
    },
    async (request, _reply) => {
      try {
        const { email } = request.body as { email: string };

        // Always return success to prevent email enumeration
        await authService.requestPasswordReset(email);

        return {
          message: 'If an account with that email exists, a password reset link has been sent.',
        };
      } catch (error) {
        fastify.log.error(error);
        // Still return success to prevent email enumeration
        return {
          message: 'If an account with that email exists, a password reset link has been sent.',
        };
      }
    }
  );

  // Reset password with token
  fastify.post(
    '/auth/reset-password',
    {
      config: {
        rateLimit: passwordResetRateLimitConfig,
      },
      preHandler: validateBody(resetPasswordSchema),
    },
    async (request, reply) => {
      try {
        const { token, newPassword } = request.body as { token: string; newPassword: string };

        await authService.resetPassword(token, newPassword);

        return {
          message: 'Password has been reset successfully. You can now log in with your new password.',
        };
      } catch (error) {
        fastify.log.error(error);

        // Return generic error message for all token-related errors
        // to prevent information leakage about token state
        if (error instanceof Error && error.message.includes('reset token')) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid or expired reset token',
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reset password',
        });
      }
    }
  );

  // Validate reset token (for frontend to check if token is valid before showing form)
  fastify.get('/auth/validate-reset-token', async (request, reply) => {
    try {
      const { token } = request.query as { token?: string };

      if (!token) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Token is required',
        });
      }

      const isValid = await authService.validateResetToken(token);

      return { valid: isValid };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to validate token',
        valid: false,
      });
    }
  });
}

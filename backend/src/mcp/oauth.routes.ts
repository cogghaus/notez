import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { notifyAdmins } from '../services/notification.service.js';
import {
  registerClient,
  validateClientCredentials,
  getClientByClientId,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  revokeToken,
  grantConsent,
  hasActiveConsent,
  approveClient,
  rejectClient,
  listClients,
  OAuthError,
  validateRedirectUri,
  cleanupExpiredOAuthData,
} from './oauth.service.js';

const MCP_SCOPES_SUPPORTED = ['mcp:read', 'mcp:write'];

// DCR request body schema
const dcrBodySchema = z.object({
  client_name: z.string().max(255).optional(),
  client_uri: z.string().url().max(2048).optional(),
  redirect_uris: z.array(z.string().url().max(2048)).min(1, 'At least one redirect_uri is required'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
  response_types: z.array(z.enum(['code'])).optional(),
  scope: z.string().max(500).optional().refine(
    (s) => !s || s.split(' ').every((scope) => MCP_SCOPES_SUPPORTED.includes(scope)),
    { message: 'Unsupported scope value' }
  ),
  token_endpoint_auth_method: z.enum(['client_secret_post']).optional(),
});

// Resolve base URL from server config, not request headers
function getBaseUrl(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error('APP_URL environment variable is required for OAuth');
  }
  return appUrl.replace(/\/+$/, ''); // strip trailing slash
}

/**
 * OAuth 2.1 routes for remote MCP connector.
 * Implements: RFC 8414 (metadata), RFC 7591 (DCR), RFC 6749 (authz), RFC 7009 (revocation)
 */
export async function oauthRoutes(fastify: FastifyInstance) {
  // Plugin-level error handler for OAuth errors per RFC 6749 format
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof OAuthError) {
      const statusCode = error.errorCode === 'invalid_client' ? 401
        : error.errorCode === 'invalid_token' ? 401
        : error.errorCode === 'invalid_grant' ? 400
        : error.errorCode === 'invalid_scope' ? 400
        : error.errorCode === 'invalid_client_metadata' ? 400
        : error.errorCode === 'unauthorized_client' ? 403
        : 400;
      return reply.code(statusCode).send(error.toJSON());
    }

    // Handle Fastify/middleware errors with explicit status codes (e.g. 401 from authenticateToken, 403 from requireAdmin)
    const err = error as { statusCode?: number; name?: string; message?: string };
    if (typeof err.statusCode === 'number' && err.statusCode < 500) {
      return reply.code(err.statusCode).send({
        error: err.name || 'Error',
        error_description: err.message || 'Request failed',
      });
    }

    // Fallback
    fastify.log.error(error);
    return reply.code(500).send({
      error: 'server_error',
      error_description: 'An unexpected error occurred',
    });
  });

  // Register application/x-www-form-urlencoded parser for RFC 6749 compliance
  // OAuth token/revoke endpoints MUST accept form-encoded bodies per spec
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req: any, body: string, done: (err: null, result: unknown) => void) => {
      done(null, Object.fromEntries(new URLSearchParams(body)));
    }
  );

  // --- Metadata Endpoints ---

  // Start OAuth cleanup interval (hourly)
  const cleanupInterval = setInterval(() => {
    cleanupExpiredOAuthData().catch((err) => fastify.log.error(err, 'OAuth cleanup failed'));
  }, 60 * 60 * 1000);
  fastify.addHook('onClose', async () => clearInterval(cleanupInterval));

  // RFC 8414: OAuth Authorization Server Metadata
  fastify.get('/.well-known/oauth-authorization-server', async () => {
    const baseUrl = getBaseUrl();
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/mcp/oauth/authorize`,
      token_endpoint: `${baseUrl}/mcp/oauth/token`,
      registration_endpoint: `${baseUrl}/mcp/oauth/register`,
      revocation_endpoint: `${baseUrl}/mcp/oauth/revoke`,
      scopes_supported: MCP_SCOPES_SUPPORTED,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: `${baseUrl}/docs`,
    };
  });

  // RFC 9728: OAuth Protected Resource Metadata
  fastify.get('/.well-known/oauth-protected-resource', async () => {
    const baseUrl = getBaseUrl();
    return {
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: MCP_SCOPES_SUPPORTED,
      resource_name: 'Notez MCP Server',
    };
  });

  // --- Dynamic Client Registration (RFC 7591) ---

  fastify.post('/mcp/oauth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (request: FastifyRequest) => `dcr:${request.ip}`,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = dcrBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new OAuthError('invalid_client_metadata', parseResult.error.issues[0]?.message || 'Invalid client metadata');
    }
    const body = parseResult.data;

    const result = await registerClient({
      clientName: body.client_name,
      clientUri: body.client_uri,
      redirectUris: body.redirect_uris,
      grantTypes: body.grant_types,
      responseTypes: body.response_types,
      scope: body.scope,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method,
    });

    // Notify admins about the new MCP client registration (auto-approved per redirect URI allowlist).
    // Admins can review and revoke from Settings > MCP Connectors.
    notifyAdmins(
      'MCP_CLIENT_PENDING',
      `New MCP connector: ${result.clientName || 'Unknown app'}`,
      'mcp_client',
      result.clientId,
      `${result.clientName || 'An application'} registered as a connector. Review in Settings > MCP Connectors.`
    ).catch((err) => fastify.log.error(err, 'Failed to notify admins about new MCP client'));

    reply.code(201);
    return {
      client_id: result.clientId,
      client_secret: result.clientSecret,
      client_id_issued_at: result.clientIdIssuedAt,
      client_secret_expires_at: result.clientSecretExpiresAt,
      client_name: result.clientName,
      redirect_uris: result.redirectUris,
      grant_types: result.grantTypes,
      response_types: result.responseTypes,
      scope: result.scope,
      token_endpoint_auth_method: result.tokenEndpointAuthMethod,
    };
  });

  // --- Authorization Endpoint ---

  fastify.get('/mcp/oauth/authorize', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => `authz:${request.ip}`,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = query;

    // Validate required params (RFC 6749 s4.1.2.1: validate client_id and redirect_uri before using them in error responses)
    if (!client_id || !redirect_uri || !code_challenge) {
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id, redirect_uri, code_challenge',
      });
    }

    if (response_type !== 'code') {
      return sendAuthError(reply, redirect_uri, state, 'unsupported_response_type', 'Only code is supported');
    }

    if (code_challenge_method && code_challenge_method !== 'S256') {
      return sendAuthError(reply, redirect_uri, state, 'invalid_request', 'Only S256 code_challenge_method is supported');
    }

    // Validate state length
    if (state && state.length > 2048) {
      return sendAuthError(reply, redirect_uri, state?.substring(0, 100), 'invalid_request', 'state parameter too long');
    }

    // Validate code_challenge is valid S256 base64url (43 chars)
    if (code_challenge && !/^[A-Za-z0-9\-_]{43}$/.test(code_challenge)) {
      return sendAuthError(reply, redirect_uri, state, 'invalid_request', 'Invalid code_challenge format for S256');
    }

    // Validate client
    const client = await getClientByClientId(client_id);
    if (!client || client.status !== 'approved') {
      return sendAuthError(reply, redirect_uri, state, 'unauthorized_client', 'Client not registered or not approved');
    }

    // Validate redirect_uri matches registered
    if (!client.redirectUris.includes(redirect_uri)) {
      // Do NOT redirect to unregistered URIs
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match registered URIs',
      });
    }

    // Validate scope against global supported scopes
    const requestedScope = scope || 'mcp:read';
    const requestedScopes = requestedScope.split(' ');
    if (requestedScopes.some((s) => !MCP_SCOPES_SUPPORTED.includes(s))) {
      return sendAuthError(reply, redirect_uri, state, 'invalid_scope', 'Unsupported scope');
    }

    // Validate scope against client's registered scope (prevents scope escalation)
    const clientScopes = (client.scope || 'mcp:read').split(' ');
    if (requestedScopes.some((s) => !clientScopes.includes(s))) {
      return sendAuthError(reply, redirect_uri, state, 'invalid_scope', 'Scope exceeds client registration');
    }

    // Fast-path: if user has a valid Bearer token and active consent, skip consent page.
    // We manually extract the token instead of calling authenticateToken (which writes 401 to reply on failure,
    // making it impossible to fall through to the consent page redirect).
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        if (token.length <= 1000) {
          const decoded = fastify.jwt.verify<{ userId: string }>(token);
          const userId = decoded.userId;
          if (!userId) throw new Error('no userId');
          // Block service accounts from the fast-path (same guard as /approve)
          const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { isServiceAccount: true } });
          if (userRecord?.isServiceAccount) throw new Error('service account');
          if (await hasActiveConsent(userId, client.id, requestedScope)) {
            // User already consented within TTL; issue code directly
            const code = await createAuthorizationCode({
              clientId: client.id,
              userId,
              redirectUri: redirect_uri,
              scope: requestedScope,
              codeChallenge: code_challenge,
              codeChallengeMethod: code_challenge_method || 'S256',
            });
            const callbackUrl = new URL(redirect_uri);
            callbackUrl.searchParams.set('code', code);
            if (state) callbackUrl.searchParams.set('state', state);
            return reply.redirect(callbackUrl.toString());
          }
        }
      } catch {
        // Token invalid/expired - fall through to consent page (expected)
      }
    }

    // Redirect to consent page with all params
    const consentUrl = new URL('/oauth/consent', getBaseUrl());
    consentUrl.searchParams.set('client_id', client_id);
    consentUrl.searchParams.set('redirect_uri', redirect_uri);
    consentUrl.searchParams.set('scope', requestedScope);
    consentUrl.searchParams.set('code_challenge', code_challenge);
    consentUrl.searchParams.set('code_challenge_method', code_challenge_method || 'S256');
    if (state) consentUrl.searchParams.set('state', state);

    return reply.redirect(consentUrl.toString());
  });

  // Internal endpoint: consent page calls this after user approves
  // Requires authenticated session (Bearer token) + same-origin CSRF check
  fastify.post('/mcp/oauth/approve', {
    preHandler: authenticateToken,
  }, async (request: FastifyRequest) => {
    // CSRF defense: verify request originates from our own consent page
    const origin = request.headers.origin;
    const appUrl = getBaseUrl();
    const appOrigin = new URL(appUrl).origin;
    if (origin && origin !== appOrigin) {
      throw new OAuthError('invalid_request', 'Cross-origin consent requests are not allowed');
    }
    // Also check Sec-Fetch-Site if the browser sends it (modern browsers)
    const secFetchSite = request.headers['sec-fetch-site'] as string | undefined;
    if (secFetchSite && secFetchSite !== 'same-origin') {
      throw new OAuthError('invalid_request', 'Cross-origin consent requests are not allowed');
    }

    const body = request.body as Record<string, string>;
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = body;

    if (!client_id || !redirect_uri || !scope || !code_challenge) {
      throw new OAuthError('invalid_request', 'Missing required parameters');
    }

    // Block service accounts from authorizing MCP clients
    const userRecord = await prisma.user.findUnique({ where: { id: request.user!.userId }, select: { isServiceAccount: true } });
    if (userRecord?.isServiceAccount) {
      throw new OAuthError('access_denied', 'Service accounts cannot authorize MCP clients');
    }

    const client = await getClientByClientId(client_id);
    if (!client || client.status !== 'approved') {
      throw new OAuthError('unauthorized_client', 'Client not approved');
    }

    if (!client.redirectUris.includes(redirect_uri)) {
      throw new OAuthError('invalid_request', 'Invalid redirect_uri');
    }

    // Validate scope against both global supported scopes and client's registered scope
    const requestedScopes = scope.split(' ');
    if (requestedScopes.some((s) => !MCP_SCOPES_SUPPORTED.includes(s))) {
      throw new OAuthError('invalid_scope', 'Unsupported scope');
    }
    const clientScopes = (client.scope || 'mcp:read').split(' ');
    if (requestedScopes.some((s) => !clientScopes.includes(s))) {
      throw new OAuthError('invalid_scope', 'Scope exceeds client registration');
    }

    const userId = request.user!.userId;

    // Record consent
    await grantConsent(userId, client.id, scope);

    // Issue authorization code
    const code = await createAuthorizationCode({
      clientId: client.id,
      userId,
      redirectUri: redirect_uri,
      scope,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
    });

    // Return the callback URL as JSON instead of 302 redirect.
    // The consent page uses fetch() which can't follow cross-origin redirects
    // (CORS blocks fetch from navigating to claude.ai's callback).
    // The frontend reads this URL and navigates with window.location.href.
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set('code', code);
    if (state) callbackUrl.searchParams.set('state', state);

    return { redirect_url: callbackUrl.toString() };
  });

  // --- Token Endpoint ---

  fastify.post('/mcp/oauth/token', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => `token:${request.ip}`,
      },
    },
  }, async (request: FastifyRequest) => {
    const body = request.body as Record<string, string>;
    const { grant_type, client_id, client_secret } = body;

    if (!client_id || !client_secret) {
      throw new OAuthError('invalid_client', 'client_id and client_secret are required');
    }

    const client = await validateClientCredentials(client_id, client_secret);

    if (grant_type === 'authorization_code') {
      const { code, redirect_uri, code_verifier } = body;

      if (!code || !redirect_uri || !code_verifier) {
        throw new OAuthError('invalid_request', 'code, redirect_uri, and code_verifier are required');
      }

      const tokens = await exchangeAuthorizationCode(
        client.id,
        code,
        code_verifier,
        redirect_uri
      );

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        scope: tokens.scope,
        refresh_token: tokens.refreshToken,
      };
    }

    if (grant_type === 'refresh_token') {
      const { refresh_token, scope } = body;

      if (!refresh_token) {
        throw new OAuthError('invalid_request', 'refresh_token is required');
      }

      const tokens = await exchangeRefreshToken(
        client.id,
        refresh_token,
        scope || undefined
      );

      return {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
        scope: tokens.scope,
        refresh_token: tokens.refreshToken,
      };
    }

    throw new OAuthError('unsupported_grant_type', 'Supported: authorization_code, refresh_token');
  });

  // --- Token Revocation (RFC 7009) ---

  fastify.post('/mcp/oauth/revoke', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => `revoke:${request.ip}`,
      },
    },
  }, async (request: FastifyRequest) => {
    const body = request.body as Record<string, string>;
    const { token, token_type_hint, client_id, client_secret } = body;

    if (!client_id || !client_secret || !token) {
      throw new OAuthError('invalid_request', 'client_id, client_secret, and token are required');
    }

    const client = await validateClientCredentials(client_id, client_secret);

    const hint = token_type_hint === 'access_token' || token_type_hint === 'refresh_token'
      ? token_type_hint : undefined;

    const revokedUserId = await revokeToken(client.id, token, hint);

    // Best-effort: close any active MCP sessions for the revoked user
    if (revokedUserId) {
      try {
        const { sessionManager } = await import('./transport.routes.js');
        await sessionManager.closeUserSessions(revokedUserId);
      } catch {
        // MCP transport not loaded (MCP_REMOTE_ENABLED=false) - no sessions to clean
      }
    }

    // RFC 7009: always 200 OK, even if token was already revoked
    return {};
  });

  // --- Admin: Client Management ---

  fastify.get('/mcp/oauth/clients', {
    preHandler: [authenticateToken, requireAdmin],
  }, async (request: FastifyRequest) => {
    const query = request.query as Record<string, string>;
    const validStatuses = ['pending_approval', 'approved', 'rejected'];
    const status = query.status && validStatuses.includes(query.status) ? query.status : undefined;
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);
    return listClients(status, limit, offset);
  });

  fastify.post('/mcp/oauth/clients/:clientId/approve', {
    preHandler: [authenticateToken, requireAdmin],
  }, async (request: FastifyRequest) => {
    const { clientId } = request.params as { clientId: string };
    await approveClient(clientId, request.user!.userId);
    return { status: 'approved' };
  });

  fastify.post('/mcp/oauth/clients/:clientId/reject', {
    preHandler: [authenticateToken, requireAdmin],
  }, async (request: FastifyRequest) => {
    const { clientId } = request.params as { clientId: string };
    await rejectClient(clientId);
    return { status: 'rejected' };
  });
}

// --- Helpers ---

function sendAuthError(
  reply: FastifyReply,
  redirectUri: string | undefined,
  state: string | undefined,
  error: string,
  description: string
) {
  if (!redirectUri || !validateRedirectUri(redirectUri)) {
    return reply.code(400).send({ error, error_description: description });
  }

  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return reply.redirect(url.toString());
}

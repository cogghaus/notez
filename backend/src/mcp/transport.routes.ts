import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { McpSessionManager, type McpSession } from './session-manager.js';
import { verifyAccessToken, OAuthError } from './oauth.service.js';
import { registerNotezTools } from './tools.js';
import { API_TOKEN_PREFIX, API_TOKEN_REFUSAL, isApiTokenClient, verifyApiTokenForMcp } from './api-token-auth.js';
import { API_TOKEN_RATE_LIMIT, apiTokenRateLimitKey } from '../utils/api-token-rate-limit.js';

// Configurable origin allowlist (Slag CHAIN-3 mitigation)
// Parse hostnames at startup to fail fast on misconfiguration and avoid per-request URL parsing
const RAW_ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || 'https://claude.ai,https://www.claude.ai')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGIN_HOSTNAMES: string[] = [];
for (const origin of RAW_ALLOWED_ORIGINS) {
  try {
    ALLOWED_ORIGIN_HOSTNAMES.push(new URL(origin).hostname);
  } catch {
    throw new Error(`Invalid URL in MCP_ALLOWED_ORIGINS: ${origin}`);
  }
}

function isOriginAllowed(origin: string): boolean {
  // Exact match only against configured origins (no subdomain wildcards)
  // Aligned with redirect URI policy in oauth.service.ts
  return RAW_ALLOWED_ORIGINS.includes(origin);
}

const sessionManager = new McpSessionManager();

/**
 * May this request use this session? Always: same user. An API-token session also belongs to that
 * one token, and an API token cannot join an OAuth session, because a session's tools were fixed
 * by the scopes of the credential that opened it. OAuth-with-OAuth keeps the user-only check.
 */
function sessionBelongsTo(session: McpSession, authInfo: AuthInfo): boolean {
  if (session.userId !== (authInfo.extra?.userId as string)) return false;
  if (isApiTokenClient(session.clientId) || isApiTokenClient(authInfo.clientId)) {
    return session.clientId === authInfo.clientId;
  }
  return true;
}

type BearerCheck = { auth: AuthInfo } | { refusal: string };

/**
 * Verify a bearer token for /mcp: an OAuth access token (claude.ai connector) or a personal API
 * token (ntez_ prefix, server-to-server clients). Never puts the token in the refusal.
 */
async function checkBearerToken(token: string): Promise<BearerCheck> {
  if (token.startsWith(API_TOKEN_PREFIX)) {
    const apiAuth = await verifyApiTokenForMcp(token);
    if (apiAuth) return { auth: apiAuth };
    // OAuth access tokens are random base64url, so one can (about once in 10^9) start with
    // "ntez_" too. Try it as one before refusing, so OAuth behaviour is unchanged.
    const oauthAuth = await verifyAccessToken(token).catch(() => null);
    if (oauthAuth) return { auth: oauthAuth };
    return { refusal: API_TOKEN_REFUSAL };
  }

  try {
    return { auth: await verifyAccessToken(token) };
  } catch (error) {
    return { refusal: error instanceof OAuthError ? error.message : 'Invalid token' };
  }
}

/**
 * MCP Streamable HTTP transport routes.
 * Handles POST (JSON-RPC), GET (SSE stream), DELETE (session close) at /mcp.
 */
export async function mcpTransportRoutes(fastify: FastifyInstance) {
  sessionManager.start();

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    sessionManager.stop();
    await sessionManager.closeAll();
  });

  // Origin validation hook for all /mcp routes
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Origin not allowed' });
    }
  });

  // CORS for /mcp - uses same origin check as preHandler
  fastify.addHook('onSend', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
      reply.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
  });

  // OPTIONS preflight
  fastify.options('/mcp', async (_request, reply) => {
    return reply.code(204).send();
  });

  // WWW-Authenticate header per RFC 6750 + MCP spec
  // Points clients to the protected resource metadata for OAuth discovery
  const appUrl = process.env.APP_URL?.replace(/\/+$/, '') || '';
  const wwwAuthenticate = `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`;

  // Bearer auth middleware for MCP routes
  async function authenticateMcpToken(request: FastifyRequest, reply: FastifyReply): Promise<AuthInfo | null> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.header('WWW-Authenticate', wwwAuthenticate);
      reply.code(401).send({ error: 'Unauthorized', message: 'Bearer token required' });
      return null;
    }

    const token = authHeader.substring(7);
    if (token.length > 500) {
      reply.header('WWW-Authenticate', wwwAuthenticate);
      reply.code(401).send({ error: 'Unauthorized', message: 'Token too long' });
      return null;
    }

    const check = await checkBearerToken(token);
    if ('auth' in check) return check.auth;

    reply.header('WWW-Authenticate', wwwAuthenticate);
    reply.code(401).send({ error: 'Unauthorized', message: check.refusal });
    return null;
  }

  // Rate limit for MCP transport. A ntez_ API token gets the REST per-token limit, keyed on the
  // token hash (utils/api-token-rate-limit.ts); anything else keys on hashed header + IP, 60/min.
  const mcpRateLimit = {
    rateLimit: {
      max: (request: FastifyRequest) =>
        apiTokenRateLimitKey(request) !== null ? API_TOKEN_RATE_LIMIT.max : 60,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => {
        const apiTokenKey = apiTokenRateLimitKey(request);
        if (apiTokenKey !== null) return apiTokenKey;
        const auth = request.headers.authorization || '';
        const tokenHash = createHash('sha256').update(auth).digest('hex').substring(0, 16);
        return `mcp-transport:${tokenHash}:${request.ip}`;
      },
    },
  };

  // POST /mcp - JSON-RPC messages (initialize, tool calls, etc.)
  fastify.post('/mcp', { config: mcpRateLimit }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authInfo = await authenticateMcpToken(request, reply);
    if (!authInfo) return; // reply already sent

    try {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let session = sessionId ? sessionManager.getSession(sessionId) : undefined;

      if (session) {
        // Verify session belongs to this token's user (Slag CHAIN-3), and to this API token
        if (!sessionBelongsTo(session, authInfo)) {
          return reply.code(403).send({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session does not belong to this token' },
            id: null,
          });
        }

        // Attach auth info and delegate to transport
        (request.raw as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
        await session.transport.handleRequest(request.raw, reply.raw, request.body);
        return;
      }

      if (!sessionId && isInitializeRequest(request.body as Record<string, unknown>)) {
        // New session
        const userId = authInfo.extra?.userId as string;
        if (typeof userId !== 'string') {
          return reply.code(403).send({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Invalid token: missing user ID' },
            id: null,
          });
        }

        const check = sessionManager.canCreateSession(userId);
        if (!check.allowed) {
          return reply.code(429).send({
            jsonrpc: '2.0',
            error: { code: -32000, message: check.reason },
            id: null,
          });
        }

        // Create server first to avoid TDZ reference in transport callback
        const server = new McpServer({
          name: 'notez',
          version: '1.23.0',
        });

        // Register tools based on granted scopes: an OAuth grant's mcp:* scopes, or an API
        // token's read/write mapped onto them (api-token-auth.ts)
        const allowedScopes = authInfo.scopes.filter(
          (s): s is 'mcp:read' | 'mcp:write' => s === 'mcp:read' || s === 'mcp:write'
        );
        registerNotezTools(server, () => userId, allowedScopes);

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            sessionManager.addSession(newSessionId, {
              server,
              transport,
              userId,
              clientId: authInfo.clientId,
              scopes: authInfo.scopes,
              lastActivity: Date.now(),
            });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessionManager.removeSession(sid);
        };

        await server.connect(transport);

        (request.raw as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
        await transport.handleRequest(request.raw, reply.raw, request.body);
        return;
      }

      // No valid session and not an init request
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    } catch (error) {
      fastify.log.error(error, 'Error handling MCP POST');
      if (!reply.sent) {
        return reply.code(500).send({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp - SSE stream for server-to-client notifications
  fastify.get('/mcp', { config: mcpRateLimit }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authInfo = await authenticateMcpToken(request, reply);
    if (!authInfo) return;

    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      return reply.code(400).send({ error: 'Missing Mcp-Session-Id header' });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!sessionBelongsTo(session, authInfo)) {
      return reply.code(403).send({ error: 'Session does not belong to this token' });
    }

    (request.raw as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    await session.transport.handleRequest(request.raw, reply.raw);
  });

  // DELETE /mcp - Session termination
  fastify.delete('/mcp', { config: mcpRateLimit }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authInfo = await authenticateMcpToken(request, reply);
    if (!authInfo) return;

    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      return reply.code(400).send({ error: 'Missing Mcp-Session-Id header' });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    if (!sessionBelongsTo(session, authInfo)) {
      return reply.code(403).send({ error: 'Session does not belong to this token' });
    }

    (request.raw as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    await session.transport.handleRequest(request.raw, reply.raw);
  });

  // Health check for MCP subsystem (basic status is public, session count requires auth)
  fastify.get('/mcp/health', async (request) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const check = token ? await checkBearerToken(token).catch(() => null) : null;
    const authInfo = check && 'auth' in check ? check.auth : null;
    return {
      status: 'ok',
      ...(authInfo ? { activeSessions: sessionManager.getSessionCount() } : {}),
    };
  });
}

export { sessionManager };

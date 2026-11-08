import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// The /mcp Streamable HTTP transport, driven over a real socket by the SDK's own client.
// Token checks are mocked at the service boundary: validateApiToken (REST's API-token check,
// which owns revocation, expiry, inactive users and lastUsedAt) and verifyAccessToken (OAuth).
// The tool registry is replaced by one probe tool per MCP scope, so a tools/list shows exactly
// which scopes the session was opened with.

// Fake credentials: shaped like the real thing, valid nowhere.
const READ_TOKEN = 'ntez_test-read-only-token-0000000000000000000000';
const RW_TOKEN = 'ntez_test-read-write-token-000000000000000000000';
const NO_SCOPE_TOKEN = 'ntez_test-no-mcp-scope-token-0000000000000000000';
const REVOKED_TOKEN = 'ntez_test-revoked-token-000000000000000000000000';
const EXPIRED_TOKEN = 'ntez_test-expired-token-000000000000000000000000';
const MALFORMED_TOKEN = 'ntez_%%not-a-token%%';
const RATE_TOKEN = 'ntez_test-rate-limit-token-000000000000000000000';
const OAUTH_TOKEN = 'oauth-test-access-token-00000000000000000000000';

vi.mock('../services/token.service.js', async () => {
  const { createHash: hash } = await import('node:crypto');
  const user = (tokenId: string, userId: string, scopes: string[]) =>
    ({ tokenId, userId, username: 'adam', role: 'user', scopes });
  return {
    hashToken: (raw: string) => hash('sha256').update(raw).digest('hex'),
    validateApiToken: vi.fn(async (raw: string) => {
      if (raw === READ_TOKEN) return user('tok-read', 'user-read', ['read']);
      if (raw === RW_TOKEN) return user('tok-rw', 'user-rw', ['read', 'write']);
      if (raw === NO_SCOPE_TOKEN) return user('tok-none', 'user-none', []);
      if (raw === RATE_TOKEN) return user('tok-rate', 'user-rate', ['read']);
      if (raw === REVOKED_TOKEN) throw new Error('Token has been revoked');
      if (raw === EXPIRED_TOKEN) throw new Error('Token has expired');
      throw new Error('Invalid token');
    }),
  };
});

vi.mock('./oauth.service.js', () => {
  class OAuthError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    OAuthError,
    verifyAccessToken: vi.fn(async (token: string) => {
      if (token === OAUTH_TOKEN) {
        return { token, clientId: 'notez_test-client', scopes: ['mcp:read'], extra: { userId: 'user-oauth' } };
      }
      throw new OAuthError('invalid_token', 'Unknown token');
    }),
  };
});

vi.mock('./tools.js', () => ({
  registerNotezTools: (
    server: { registerTool: (name: string, config: object, cb: () => unknown) => void },
    _getUserId: () => string,
    scopes: string[],
  ) => {
    const probe = async () => ({ content: [{ type: 'text', text: 'ok' }] });
    if (scopes.includes('mcp:read')) server.registerTool('probe_read', { description: 'read probe' }, probe);
    if (scopes.includes('mcp:write')) server.registerTool('probe_write', { description: 'write probe' }, probe);
  },
}));

import { validateApiToken } from '../services/token.service.js';
import { verifyAccessToken } from './oauth.service.js';

const APP_URL = 'https://notez.home.example';
const WWW_AUTHENTICATE = `Bearer resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`;

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'probe', version: '0' } },
};

let app: FastifyInstance;
let base: string;
const logLines: string[] = [];

beforeAll(async () => {
  process.env.APP_URL = APP_URL;
  const { mcpTransportRoutes } = await import('./transport.routes.js');
  app = Fastify({ logger: { level: 'trace', stream: { write: (line: string) => { logLines.push(line); } } } });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', keyGenerator: (r) => r.ip });
  await app.register(mcpTransportRoutes);
  base = await app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await app.close();
});

/** Open a session as a real MCP client would, list the tools, close the session. */
async function listToolsWith(token: string): Promise<string[]> {
  const client = new Client({ name: 'transport-test', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name).sort();
  } finally {
    await transport.terminateSession();
    await client.close();
  }
}

function postInitialize(authorization?: string) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(INITIALIZE),
  });
}

describe('MCP transport: API tokens (ntez_)', () => {
  it('a read token opens a session and lists only the read tools', async () => {
    expect(await listToolsWith(READ_TOKEN)).toEqual(['probe_read']);
    expect(vi.mocked(validateApiToken)).toHaveBeenCalledWith(READ_TOKEN);
  });

  it('a read+write token lists the read and the write tools', async () => {
    expect(await listToolsWith(RW_TOKEN)).toEqual(['probe_read', 'probe_write']);
  });

  it('the health check counts sessions for an API token, as it does for OAuth', async () => {
    const res = await fetch(`${base}/mcp/health`, { headers: { Authorization: `Bearer ${READ_TOKEN}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('activeSessions');
  });
});

describe('MCP transport: OAuth access tokens (claude.ai)', () => {
  it('an OAuth token still opens a session and lists its tools', async () => {
    vi.mocked(validateApiToken).mockClear();
    expect(await listToolsWith(OAUTH_TOKEN)).toEqual(['probe_read']);
    expect(vi.mocked(verifyAccessToken)).toHaveBeenCalledWith(OAUTH_TOKEN);
    expect(vi.mocked(validateApiToken)).not.toHaveBeenCalled();
  });

  it('a bad OAuth token keeps its own 401 message', async () => {
    const res = await postInitialize('Bearer oauth-test-unknown-token');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(WWW_AUTHENTICATE);
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Unknown token' });
  });
});

describe('MCP transport: refused API tokens', () => {
  it('no token at all: 401 with the discovery header (baseline)', async () => {
    const res = await postInitialize();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(WWW_AUTHENTICATE);
  });

  it.each([
    ['revoked', REVOKED_TOKEN],
    ['expired', EXPIRED_TOKEN],
    ['without an MCP scope', NO_SCOPE_TOKEN],
    ['malformed', MALFORMED_TOKEN],
  ])('a %s token: 401, the same WWW-Authenticate, one message, token not echoed', async (_case, token) => {
    const res = await postInitialize(`Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(WWW_AUTHENTICATE);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: 'Unauthorized', message: 'Invalid or expired API token' });
    expect(body).not.toContain(token);
  });

});

describe('MCP transport: rate limits', () => {
  // A POST without a session and without an initialize body passes auth, then answers 400, so
  // these requests count against the limit without opening sessions.
  const NOT_INITIALIZE = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  async function statuses(authorization: string, count: number): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const res = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: authorization },
        body: JSON.stringify(NOT_INITIALIZE),
      });
      await res.arrayBuffer();
      out.push(res.status);
    }
    return out;
  }

  it('an API token gets the REST per-token limit: 120 a minute, then 429', async () => {
    const seen = await statuses(`Bearer ${RATE_TOKEN}`, 121);
    expect(seen.slice(0, 120).every((s) => s === 400)).toBe(true);
    expect(seen[120]).toBe(429);
  });

  it('an OAuth bearer keeps the transport limit: 60 a minute, then 429', async () => {
    const seen = await statuses('Bearer oauth-test-rate-limit-token', 61);
    expect(seen.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(seen[60]).toBe(429);
  });
});

describe('MCP transport: logging', () => {
  it('never writes an API token to the log', () => {
    const log = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(0);
    for (const token of [READ_TOKEN, RW_TOKEN, NO_SCOPE_TOKEN, REVOKED_TOKEN, EXPIRED_TOKEN, MALFORMED_TOKEN, RATE_TOKEN]) {
      expect(log).not.toContain(token);
      expect(log).not.toContain(createHash('sha256').update(token).digest('hex'));
    }
  });
});

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { validateApiToken } from '../services/token.service.js';
import type { McpScope } from './tools.js';

/**
 * Personal API tokens (ntez_) on the MCP transport, for server-to-server clients that cannot run
 * the OAuth flow. Verification is REST's own validateApiToken, so revocation, expiry, inactive
 * users and lastUsedAt behave exactly as they do on /api/v1; there is no second token store.
 */

export const API_TOKEN_PREFIX = 'ntez_';

/** clientId prefix that marks an MCP session or request as opened by an API token. */
export const API_TOKEN_CLIENT_PREFIX = 'api-token:';

/** One refusal for every failed API token, so a response never tells revoked from expired. */
export const API_TOKEN_REFUSAL = 'Invalid or expired API token';

/**
 * API token scope -> MCP tool scope. The token's scopes decide which tools a session registers.
 * Scopes not listed here grant nothing on MCP.
 */
export const API_TOKEN_SCOPE_TO_MCP: Readonly<Record<string, McpScope>> = {
  read: 'mcp:read',
  write: 'mcp:write',
};

export function mapApiTokenScopes(scopes: readonly string[]): McpScope[] {
  const mapped = new Set<McpScope>();
  for (const scope of scopes) {
    if (Object.prototype.hasOwnProperty.call(API_TOKEN_SCOPE_TO_MCP, scope)) {
      mapped.add(API_TOKEN_SCOPE_TO_MCP[scope]);
    }
  }
  return [...mapped];
}

export function isApiTokenClient(clientId: string): boolean {
  return clientId.startsWith(API_TOKEN_CLIENT_PREFIX);
}

/**
 * Verify a ntez_ token for MCP. Returns null when the token is unknown, revoked, expired, belongs
 * to an inactive user, or carries no scope that maps onto an MCP tool scope. The reason is not
 * returned: callers answer every case the same way.
 */
export async function verifyApiTokenForMcp(raw: string): Promise<AuthInfo | null> {
  let result: Awaited<ReturnType<typeof validateApiToken>>;
  try {
    result = await validateApiToken(raw);
  } catch {
    return null;
  }

  const scopes = mapApiTokenScopes(result.scopes);
  if (scopes.length === 0) return null;

  return {
    // The raw token is not carried past this point: nothing downstream needs it, and a value
    // that is not held cannot be logged or echoed.
    token: '',
    clientId: `${API_TOKEN_CLIENT_PREFIX}${result.tokenId}`,
    scopes,
    extra: { userId: result.userId, apiTokenId: result.tokenId },
  };
}

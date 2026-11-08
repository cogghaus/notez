import type { FastifyRequest } from 'fastify';
import { hashToken } from '../services/token.service.js';

/**
 * Rate limit for requests that carry a personal API token (ntez_), shared by the REST API
 * (/api/v1, /api/mcp) and the MCP transport (/mcp) so a token is limited the same way on both.
 */
export const API_TOKEN_RATE_LIMIT = { max: 120, timeWindow: '1 minute' } as const;

/**
 * Rate-limit key for a ntez_ bearer: the token's hash, so the limit follows the token, not the
 * client IP, and the raw token never becomes a key. Null when the request carries no API token.
 */
export function apiTokenRateLimitKey(request: FastifyRequest): string | null {
  const auth = request.headers.authorization || '';
  if (!auth.startsWith('Bearer ntez_')) return null;
  return `mcp:${hashToken(auth.substring(7))}`;
}

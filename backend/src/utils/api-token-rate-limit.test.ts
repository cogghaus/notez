import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { apiTokenRateLimitKey, API_TOKEN_RATE_LIMIT } from './api-token-rate-limit.js';
import { hashToken } from '../services/token.service.js';

const token = 'ntez_test-rate-key-token-0000000000000000000000';

function req(authorization: string | undefined, ip: string): FastifyRequest {
  return { headers: authorization ? { authorization } : {}, ip } as unknown as FastifyRequest;
}

describe('apiTokenRateLimitKey', () => {
  it('keys a ntez_ bearer on the token hash, whatever the client IP', () => {
    const a = apiTokenRateLimitKey(req(`Bearer ${token}`, '192.0.2.1'));
    const b = apiTokenRateLimitKey(req(`Bearer ${token}`, '192.0.2.2'));
    expect(a).toBe(`mcp:${hashToken(token)}`);
    expect(b).toBe(a);
    expect(a).not.toContain(token);
  });

  it('returns null for anything that is not a ntez_ bearer', () => {
    expect(apiTokenRateLimitKey(req(undefined, '192.0.2.1'))).toBeNull();
    expect(apiTokenRateLimitKey(req('Bearer some-oauth-token', '192.0.2.1'))).toBeNull();
    expect(apiTokenRateLimitKey(req(`Basic ${token}`, '192.0.2.1'))).toBeNull();
  });

  it('is the REST per-token limit: 120 a minute', () => {
    expect(API_TOKEN_RATE_LIMIT).toEqual({ max: 120, timeWindow: '1 minute' });
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/token.service.js', () => ({ validateApiToken: vi.fn() }));

import { mapApiTokenScopes, verifyApiTokenForMcp } from './api-token-auth.js';
import { validateApiToken } from '../services/token.service.js';

describe('mapApiTokenScopes', () => {
  it('maps read to mcp:read and write to mcp:write', () => {
    expect(mapApiTokenScopes(['read'])).toEqual(['mcp:read']);
    expect(mapApiTokenScopes(['write'])).toEqual(['mcp:write']);
    expect(mapApiTokenScopes(['read', 'write'])).toEqual(['mcp:read', 'mcp:write']);
  });

  it('grants nothing for scopes it does not know, including object prototype names', () => {
    expect(mapApiTokenScopes([])).toEqual([]);
    expect(mapApiTokenScopes(['admin', 'mcp:write', 'constructor', '__proto__', 'toString'])).toEqual([]);
  });

  it('drops duplicates', () => {
    expect(mapApiTokenScopes(['read', 'read'])).toEqual(['mcp:read']);
  });
});

describe('verifyApiTokenForMcp', () => {
  const token = 'ntez_test-unit-token-00000000000000000000000000';

  it('returns MCP auth info that does not carry the raw token', async () => {
    vi.mocked(validateApiToken).mockResolvedValueOnce({
      tokenId: 'tok-1', userId: 'user-1', username: 'adam', role: 'user', scopes: ['read'],
    });
    const auth = await verifyApiTokenForMcp(token);
    expect(auth).toEqual({
      token: '',
      clientId: 'api-token:tok-1',
      scopes: ['mcp:read'],
      extra: { userId: 'user-1', apiTokenId: 'tok-1' },
    });
    expect(JSON.stringify(auth)).not.toContain(token);
  });

  it('returns null when REST validation refuses the token', async () => {
    vi.mocked(validateApiToken).mockRejectedValueOnce(new Error('Token has been revoked'));
    expect(await verifyApiTokenForMcp(token)).toBeNull();
  });

  it('returns null when no scope maps onto MCP', async () => {
    vi.mocked(validateApiToken).mockResolvedValueOnce({
      tokenId: 'tok-2', userId: 'user-1', username: 'adam', role: 'user', scopes: [],
    });
    expect(await verifyApiTokenForMcp(token)).toBeNull();
  });
});

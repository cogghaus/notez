import { describe, it, expect } from 'vitest';
import { ssoErrorMessage, SSO_ERROR_MESSAGES, SSO_ERROR_FALLBACK } from './ssoMessages';

describe('ssoErrorMessage', () => {
  it('maps a known code to its message', () => {
    expect(ssoErrorMessage('expired')).toBe(SSO_ERROR_MESSAGES.expired);
  });

  it('falls back for unknown or missing codes', () => {
    expect(ssoErrorMessage('nope')).toBe(SSO_ERROR_FALLBACK);
    expect(ssoErrorMessage(null)).toBe(SSO_ERROR_FALLBACK);
    expect(ssoErrorMessage(undefined)).toBe(SSO_ERROR_FALLBACK);
  });

  // The code comes from the URL: inherited object keys must not reach the UI
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('falls back for %s', (code) => {
    expect(ssoErrorMessage(code)).toBe(SSO_ERROR_FALLBACK);
  });
});

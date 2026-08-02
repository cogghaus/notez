import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  type TokenPayload,
} from './jwt.utils.js';

const testPayload: TokenPayload = {
  userId: 'user-123',
  username: 'testuser',
  role: 'user',
};

describe('jwt.utils', () => {
  describe('generateTokenPair', () => {
    it('should return both accessToken and refreshToken', () => {
      const tokens = generateTokenPair(testPayload);
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should produce different access and refresh tokens', () => {
      const tokens = generateTokenPair(testPayload);
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should embed the correct payload in the access token', () => {
      const tokens = generateTokenPair(testPayload);
      const decoded = verifyAccessToken(tokens.accessToken);
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.username).toBe(testPayload.username);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should embed the correct payload in the refresh token', () => {
      const tokens = generateTokenPair(testPayload);
      const decoded = verifyRefreshToken(tokens.refreshToken);
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.username).toBe(testPayload.username);
      expect(decoded.role).toBe(testPayload.role);
    });

    // Two pairs minted back to back land in the same second, so `iat` is
    // identical. Without a unique jti the refresh tokens came out byte-identical,
    // which made rotation a no-op and collided on the session unique index.
    it('should mint a unique refresh token even when issued in the same second', () => {
      const first = generateTokenPair(testPayload);
      const second = generateTokenPair(testPayload);

      expect(first.refreshToken).not.toBe(second.refreshToken);

      const a = jwt.decode(first.refreshToken) as { iat: number; jti: string };
      const b = jwt.decode(second.refreshToken) as { iat: number; jti: string };
      expect(a.iat).toBe(b.iat); // same second — proves jti is what differs
      expect(a.jti).toBeDefined();
      expect(a.jti).not.toBe(b.jti);
    });

    it('should still verify a refresh token carrying a jti', () => {
      const { refreshToken } = generateTokenPair(testPayload);
      expect(() => verifyRefreshToken(refreshToken)).not.toThrow();
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const { accessToken } = generateTokenPair(testPayload);
      const decoded = verifyAccessToken(accessToken);
      expect(decoded.userId).toBe('user-123');
    });

    it('should throw for an invalid token string', () => {
      expect(() => verifyAccessToken('invalid.token.string')).toThrow(
        'Invalid or expired access token'
      );
    });

    it('should throw for a token signed with a completely different secret', () => {
      const fakeToken = jwt.sign(testPayload, 'wrong-secret-entirely', {
        algorithm: 'HS256',
      });
      expect(() => verifyAccessToken(fakeToken)).toThrow(
        'Invalid or expired access token'
      );
    });

    it('should throw for an expired token', () => {
      // Manually create an expired token with the test secret
      const expired = jwt.sign(testPayload, 'test-jwt-access-secret-for-vitest', {
        expiresIn: '0s',
        algorithm: 'HS256',
      });
      expect(() => verifyAccessToken(expired)).toThrow(
        'Invalid or expired access token'
      );
    });

    it('should throw for a token signed with wrong algorithm', () => {
      const wrongAlg = jwt.sign(testPayload, 'test-jwt-access-secret-for-vitest', {
        algorithm: 'HS384',
      });
      expect(() => verifyAccessToken(wrongAlg)).toThrow(
        'Invalid or expired access token'
      );
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const { refreshToken } = generateTokenPair(testPayload);
      const decoded = verifyRefreshToken(refreshToken);
      expect(decoded.userId).toBe('user-123');
    });

    it('should throw for an invalid token string', () => {
      expect(() => verifyRefreshToken('garbage')).toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should throw for a token signed with a completely different secret', () => {
      const fakeToken = jwt.sign(testPayload, 'totally-wrong-secret', {
        algorithm: 'HS256',
      });
      expect(() => verifyRefreshToken(fakeToken)).toThrow(
        'Invalid or expired refresh token'
      );
    });
  });

  describe('decodeToken', () => {
    it('should decode a valid token without verification', () => {
      const { accessToken } = generateTokenPair(testPayload);
      const decoded = decodeToken(accessToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe('user-123');
      expect(decoded!.username).toBe('testuser');
    });

    it('should return null for completely invalid input', () => {
      const decoded = decodeToken('not-a-jwt');
      expect(decoded).toBeNull();
    });
  });
});

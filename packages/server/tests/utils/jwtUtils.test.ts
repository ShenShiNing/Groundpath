import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  calculateExpirationDate,
  extractBearerToken,
} from '../../src/utils/jwtUtils';
import { AUTH_CONFIG } from '../../src/config/authConfig';
import type { AccessTokenPayload, RefreshTokenPayload } from '../../src/types/authTypes';
import { AuthError } from '../../src/utils/errors';

describe('jwtUtils', () => {
  // ==================== Access Token Tests ====================
  describe('generateAccessToken', () => {
    const validPayload: AccessTokenPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      status: 'active',
      emailVerified: true,
    };

    it('should generate a valid JWT token', () => {
      const token = generateAccessToken(validPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include all payload fields in the token', () => {
      const token = generateAccessToken(validPayload);
      const decoded = jwt.decode(token) as jwt.JwtPayload & AccessTokenPayload;

      expect(decoded.sub).toBe(validPayload.sub);
      expect(decoded.email).toBe(validPayload.email);
      expect(decoded.username).toBe(validPayload.username);
      expect(decoded.status).toBe(validPayload.status);
      expect(decoded.emailVerified).toBe(validPayload.emailVerified);
    });

    it('should set the correct expiration time', () => {
      const token = generateAccessToken(validPayload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      // 15 minutes = 900 seconds
      expect(decoded.exp! - decoded.iat!).toBe(15 * 60);
    });

    it('should generate different tokens for different payloads', () => {
      const payload2: AccessTokenPayload = {
        ...validPayload,
        sub: 'user-456',
      };

      const token1 = generateAccessToken(validPayload);
      const token2 = generateAccessToken(payload2);

      expect(token1).not.toBe(token2);
    });

    it('should handle different user statuses', () => {
      const statuses: Array<'active' | 'inactive' | 'banned'> = ['active', 'inactive', 'banned'];

      statuses.forEach((status) => {
        const payload: AccessTokenPayload = { ...validPayload, status };
        const token = generateAccessToken(payload);
        const decoded = jwt.decode(token) as jwt.JwtPayload & AccessTokenPayload;

        expect(decoded.status).toBe(status);
      });
    });

    it('should handle emailVerified as false', () => {
      const payload: AccessTokenPayload = { ...validPayload, emailVerified: false };
      const token = generateAccessToken(payload);
      const decoded = jwt.decode(token) as jwt.JwtPayload & AccessTokenPayload;

      expect(decoded.emailVerified).toBe(false);
    });
  });

  describe('verifyAccessToken', () => {
    const validPayload: AccessTokenPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      status: 'active',
      emailVerified: true,
    };

    it('should verify and return payload for valid token', () => {
      const token = generateAccessToken(validPayload);
      const result = verifyAccessToken(token);

      expect(result.sub).toBe(validPayload.sub);
      expect(result.email).toBe(validPayload.email);
      expect(result.username).toBe(validPayload.username);
      expect(result.status).toBe(validPayload.status);
      expect(result.emailVerified).toBe(validPayload.emailVerified);
    });

    it('should throw TOKEN_EXPIRED error for expired token', () => {
      // Create an expired token
      const expiredToken = jwt.sign(validPayload, AUTH_CONFIG.accessToken.secret, {
        expiresIn: '-1s', // Already expired
        algorithm: 'HS256',
      });

      expect(() => verifyAccessToken(expiredToken)).toThrow(AuthError);
      try {
        verifyAccessToken(expiredToken);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_EXPIRED);
        expect((error as AuthError).message).toBe('Access token has expired');
      }
    });

    it('should throw TOKEN_INVALID error for malformed token', () => {
      const malformedToken = 'not.a.valid.jwt.token';

      expect(() => verifyAccessToken(malformedToken)).toThrow(AuthError);
      try {
        verifyAccessToken(malformedToken);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
        expect((error as AuthError).message).toBe('Invalid access token');
      }
    });

    it('should throw TOKEN_INVALID error for token signed with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(validPayload, 'wrong-secret', {
        expiresIn: '15m',
        algorithm: 'HS256',
      });

      expect(() => verifyAccessToken(tokenWithWrongSecret)).toThrow(AuthError);
      try {
        verifyAccessToken(tokenWithWrongSecret);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should throw TOKEN_INVALID error for empty token', () => {
      expect(() => verifyAccessToken('')).toThrow(AuthError);
      try {
        verifyAccessToken('');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should throw TOKEN_INVALID error for token with invalid signature', () => {
      const token = generateAccessToken(validPayload);
      // Tamper with the signature
      const parts = token.split('.');
      parts[2] = 'invalid_signature';
      const tamperedToken = parts.join('.');

      expect(() => verifyAccessToken(tamperedToken)).toThrow(AuthError);
      try {
        verifyAccessToken(tamperedToken);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should throw TOKEN_INVALID error for token with different algorithm', () => {
      // Create token with HS384 algorithm
      const tokenWithDiffAlgo = jwt.sign(validPayload, AUTH_CONFIG.accessToken.secret, {
        expiresIn: '15m',
        algorithm: 'HS384',
      });

      expect(() => verifyAccessToken(tokenWithDiffAlgo)).toThrow(AuthError);
    });

    it('should re-throw unknown errors', () => {
      // Mock jwt.verify to throw a non-JWT error
      const customError = new Error('Unknown error');

      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw customError;
      });

      expect(() => verifyAccessToken('any-token')).toThrow(customError);

      // Restore original
      vi.mocked(jwt.verify).mockRestore();
    });
  });

  // ==================== Refresh Token Tests ====================
  describe('generateRefreshToken', () => {
    const userId = 'user-123';
    const tokenId = 'token-456';

    it('should generate a valid JWT token', () => {
      const token = generateRefreshToken(userId, tokenId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include correct payload fields', () => {
      const token = generateRefreshToken(userId, tokenId);
      const decoded = jwt.decode(token) as jwt.JwtPayload & RefreshTokenPayload;

      expect(decoded.sub).toBe(userId);
      expect(decoded.jti).toBe(tokenId);
      expect(decoded.type).toBe('refresh');
    });

    it('should set the correct expiration time (7 days)', () => {
      const token = generateRefreshToken(userId, tokenId);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      // 7 days = 604800 seconds
      expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60);
    });

    it('should generate different tokens for different user IDs', () => {
      const token1 = generateRefreshToken('user-1', tokenId);
      const token2 = generateRefreshToken('user-2', tokenId);

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different token IDs', () => {
      const token1 = generateRefreshToken(userId, 'token-1');
      const token2 = generateRefreshToken(userId, 'token-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyRefreshToken', () => {
    const userId = 'user-123';
    const tokenId = 'token-456';

    it('should verify and return payload for valid token', () => {
      const token = generateRefreshToken(userId, tokenId);
      const result = verifyRefreshToken(token);

      expect(result.sub).toBe(userId);
      expect(result.jti).toBe(tokenId);
      expect(result.type).toBe('refresh');
    });

    it('should throw TOKEN_EXPIRED error for expired token', () => {
      const expiredToken = jwt.sign(
        { sub: userId, jti: tokenId, type: 'refresh' },
        AUTH_CONFIG.refreshToken.secret,
        { expiresIn: '-1s', algorithm: 'HS256' }
      );

      expect(() => verifyRefreshToken(expiredToken)).toThrow(AuthError);
      try {
        verifyRefreshToken(expiredToken);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_EXPIRED);
        expect((error as AuthError).message).toBe('Refresh token has expired');
      }
    });

    it('should throw TOKEN_INVALID error for malformed token', () => {
      expect(() => verifyRefreshToken('invalid.token')).toThrow(AuthError);
      try {
        verifyRefreshToken('invalid.token');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
        expect((error as AuthError).message).toBe('Invalid refresh token');
      }
    });

    it('should throw TOKEN_INVALID error for token signed with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(
        { sub: userId, jti: tokenId, type: 'refresh' },
        'wrong-secret',
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      expect(() => verifyRefreshToken(tokenWithWrongSecret)).toThrow(AuthError);
      try {
        verifyRefreshToken(tokenWithWrongSecret);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should throw TOKEN_INVALID error for wrong token type', () => {
      const tokenWithWrongType = jwt.sign(
        { sub: userId, jti: tokenId, type: 'access' },
        AUTH_CONFIG.refreshToken.secret,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      expect(() => verifyRefreshToken(tokenWithWrongType)).toThrow(AuthError);
      try {
        verifyRefreshToken(tokenWithWrongType);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
        expect((error as AuthError).message).toBe('Invalid token type');
      }
    });

    it('should throw TOKEN_INVALID error for missing type field', () => {
      const tokenWithoutType = jwt.sign(
        { sub: userId, jti: tokenId },
        AUTH_CONFIG.refreshToken.secret,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      expect(() => verifyRefreshToken(tokenWithoutType)).toThrow(AuthError);
      try {
        verifyRefreshToken(tokenWithoutType);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should throw TOKEN_INVALID error for empty token', () => {
      expect(() => verifyRefreshToken('')).toThrow(AuthError);
    });

    it('should throw TOKEN_INVALID error for token with tampered signature', () => {
      const token = generateRefreshToken(userId, tokenId);
      const parts = token.split('.');
      parts[2] = 'tampered_signature_here';
      const tamperedToken = parts.join('.');

      expect(() => verifyRefreshToken(tamperedToken)).toThrow(AuthError);
      try {
        verifyRefreshToken(tamperedToken);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      }
    });

    it('should re-throw unknown errors', () => {
      const customError = new Error('Database connection failed');

      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw customError;
      });

      expect(() => verifyRefreshToken('any-token')).toThrow(customError);

      vi.mocked(jwt.verify).mockRestore();
    });

    it('should re-throw AuthError without wrapping', () => {
      const authError = new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'Custom auth error');

      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw authError;
      });

      expect(() => verifyRefreshToken('any-token')).toThrow(authError);

      vi.mocked(jwt.verify).mockRestore();
    });
  });

  // ==================== Utility Function Tests ====================
  describe('calculateExpirationDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should calculate correct expiration date', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const expiresInSeconds = 900; // 15 minutes
      const result = calculateExpirationDate(expiresInSeconds);

      expect(result).toEqual(new Date('2024-01-15T10:15:00Z'));
    });

    it('should handle 0 seconds', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const result = calculateExpirationDate(0);

      expect(result).toEqual(now);
    });

    it('should handle large values (7 days)', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const sevenDays = 7 * 24 * 60 * 60; // 604800 seconds
      const result = calculateExpirationDate(sevenDays);

      expect(result).toEqual(new Date('2024-01-22T10:00:00Z'));
    });

    it('should handle 1 second', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const result = calculateExpirationDate(1);

      expect(result).toEqual(new Date('2024-01-15T10:00:01Z'));
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const result = extractBearerToken(`Bearer ${token}`);

      expect(result).toBe(token);
    });

    it('should return null for undefined header', () => {
      const result = extractBearerToken(undefined);

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = extractBearerToken('');

      expect(result).toBeNull();
    });

    it('should return null for header without Bearer prefix', () => {
      const result = extractBearerToken('Basic dXNlcjpwYXNz');

      expect(result).toBeNull();
    });

    it('should return null for "Bearer" without space', () => {
      const result = extractBearerToken('Bearertoken123');

      expect(result).toBeNull();
    });

    it('should return empty string for "Bearer " with no token', () => {
      const result = extractBearerToken('Bearer ');

      expect(result).toBe('');
    });

    it('should handle token with spaces in it (edge case)', () => {
      // This tests the slice behavior - it should take everything after "Bearer "
      const result = extractBearerToken('Bearer token with spaces');

      expect(result).toBe('token with spaces');
    });

    it('should be case-sensitive for Bearer prefix', () => {
      const result = extractBearerToken('bearer token123');

      expect(result).toBeNull();
    });

    it('should return null for "BEARER" (uppercase)', () => {
      const result = extractBearerToken('BEARER token123');

      expect(result).toBeNull();
    });

    it('should handle very long tokens', () => {
      const longToken = 'a'.repeat(10000);
      const result = extractBearerToken(`Bearer ${longToken}`);

      expect(result).toBe(longToken);
    });
  });

  // ==================== Integration Tests ====================
  describe('Access Token Round Trip', () => {
    it('should generate and verify token successfully', () => {
      const payload: AccessTokenPayload = {
        sub: 'user-integration-test',
        email: 'integration@test.com',
        username: 'integrationuser',
        status: 'active',
        emailVerified: true,
      };

      const token = generateAccessToken(payload);
      const verified = verifyAccessToken(token);

      expect(verified).toEqual(payload);
    });
  });

  describe('Refresh Token Round Trip', () => {
    it('should generate and verify token successfully', () => {
      const userId = 'user-round-trip';
      const tokenId = 'token-round-trip';

      const token = generateRefreshToken(userId, tokenId);
      const verified = verifyRefreshToken(token);

      expect(verified.sub).toBe(userId);
      expect(verified.jti).toBe(tokenId);
      expect(verified.type).toBe('refresh');
    });
  });

  describe('Cross-token validation', () => {
    it('should fail when using access token secret to verify refresh token', () => {
      const refreshToken = generateRefreshToken('user-1', 'token-1');

      expect(() => verifyAccessToken(refreshToken)).toThrow(AuthError);
    });

    it('should fail when using refresh token secret to verify access token', () => {
      const accessToken = generateAccessToken({
        sub: 'user-1',
        email: 'test@test.com',
        username: 'test',
        status: 'active',
        emailVerified: true,
      });

      expect(() => verifyRefreshToken(accessToken)).toThrow(AuthError);
    });
  });
});

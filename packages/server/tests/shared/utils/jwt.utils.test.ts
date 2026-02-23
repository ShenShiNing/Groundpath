import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractBearerToken,
} from '@shared/utils/jwt.utils';
import { authConfig } from '@config/env';
import type { AccessTokenPayload } from '@shared/types';
import { AppError } from '@shared/errors';

describe('jwt utils', () => {
  const accessPayload: AccessTokenPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    status: 'active',
    emailVerified: true,
    sid: 'session-123',
  };

  describe('access token', () => {
    it('generates and verifies a valid access token', () => {
      const token = generateAccessToken(accessPayload);
      const verified = verifyAccessToken(token);
      expect(verified).toEqual(accessPayload);
    });

    it('contains iss/aud claims', () => {
      const token = generateAccessToken(accessPayload);
      const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt & {
        payload: jwt.JwtPayload;
      };

      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.payload.iss).toBe(authConfig.jwt.issuer);
      expect(decoded.payload.aud).toBe(authConfig.jwt.audience);
    });

    it('rejects expired token', () => {
      const expiredToken = jwt.sign(accessPayload, authConfig.jwt.secret, {
        algorithm: 'HS256',
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
        expiresIn: '-1s',
      });

      expect(() => verifyAccessToken(expiredToken)).toThrow(AppError);
      try {
        verifyAccessToken(expiredToken);
      } catch (error) {
        expect((error as AppError).code).toBe(AUTH_ERROR_CODES.TOKEN_EXPIRED);
      }
    });

    it('rejects wrong algorithm', () => {
      const token = jwt.sign(accessPayload, 'wrong-secret', {
        algorithm: 'HS384',
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
        expiresIn: '15m',
      });

      expect(() => verifyAccessToken(token)).toThrow(AppError);
    });

    it('rejects token signed with wrong secret', () => {
      const token = jwt.sign(accessPayload, 'a-completely-different-secret-key!', {
        algorithm: 'HS256',
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
        expiresIn: '15m',
      });

      expect(() => verifyAccessToken(token)).toThrow(AppError);
    });

    it('rejects refresh token in access verifier', () => {
      const refreshToken = generateRefreshToken('user-123', 'session-123');
      expect(() => verifyAccessToken(refreshToken)).toThrow(AppError);
    });

    it('rethrows unknown errors', () => {
      const token = generateAccessToken(accessPayload);
      const customError = new Error('Unknown error');
      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw customError;
      });

      expect(() => verifyAccessToken(token)).toThrow(customError);
      vi.mocked(jwt.verify).mockRestore();
    });
  });

  describe('refresh token', () => {
    it('generates and verifies a valid refresh token', () => {
      const token = generateRefreshToken('user-123', 'session-123');
      const verified = verifyRefreshToken(token);

      expect(verified.sub).toBe('user-123');
      expect(verified.sid).toBe('session-123');
      expect(verified.jti).toBe('session-123');
      expect(verified.type).toBe('refresh');
    });

    it('rejects expired refresh token', () => {
      const token = jwt.sign(
        { sub: 'user-123', sid: 'session-123', jti: 'session-123', type: 'refresh' },
        authConfig.jwt.secret,
        {
          algorithm: 'HS256',
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience,
          expiresIn: '-1s',
        }
      );

      expect(() => verifyRefreshToken(token)).toThrow(AppError);
      try {
        verifyRefreshToken(token);
      } catch (error) {
        expect((error as AppError).code).toBe(AUTH_ERROR_CODES.TOKEN_EXPIRED);
      }
    });

    it('rejects wrong token type', () => {
      const token = jwt.sign(
        { sub: 'user-123', sid: 'session-123', jti: 'session-123', type: 'access' },
        authConfig.jwt.secret,
        {
          algorithm: 'HS256',
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience,
          expiresIn: '7d',
        }
      );

      expect(() => verifyRefreshToken(token)).toThrow(AppError);
    });

    it('rejects mismatched sid and jti', () => {
      const token = jwt.sign(
        { sub: 'user-123', sid: 'session-a', jti: 'session-b', type: 'refresh' },
        authConfig.jwt.secret,
        {
          algorithm: 'HS256',
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience,
          expiresIn: '7d',
        }
      );

      expect(() => verifyRefreshToken(token)).toThrow(AppError);
    });

    it('rejects token signed with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'user-123', sid: 'session-123', jti: 'session-123', type: 'refresh' },
        'a-completely-different-secret-key!',
        {
          algorithm: 'HS256',
          issuer: authConfig.jwt.issuer,
          audience: authConfig.jwt.audience,
          expiresIn: '7d',
        }
      );

      expect(() => verifyRefreshToken(token)).toThrow(AppError);
    });

    it('rethrows unknown errors', () => {
      const token = generateRefreshToken('user-123', 'session-123');
      const customError = new Error('Unknown error');
      vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw customError;
      });

      expect(() => verifyRefreshToken(token)).toThrow(customError);
      vi.mocked(jwt.verify).mockRestore();
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from a valid bearer header', () => {
      expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('returns null for invalid headers', () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken('')).toBeNull();
      expect(extractBearerToken('Basic aaa')).toBeNull();
    });
  });
});

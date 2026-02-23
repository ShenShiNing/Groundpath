import { describe, expect, it } from 'vitest';
import {
  hashRefreshToken,
  safeCompareTokenHash,
  isStoredRefreshTokenMatch,
} from '@shared/utils/refresh-token.utils';

describe('refresh-token.utils', () => {
  describe('hashRefreshToken', () => {
    it('should produce deterministic hash for the same token', () => {
      const token = 'sample-refresh-token';
      expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    });

    it('should produce different hash for different tokens', () => {
      expect(hashRefreshToken('token-1')).not.toBe(hashRefreshToken('token-2'));
    });
  });

  describe('safeCompareTokenHash', () => {
    it('should return true for identical hashes', () => {
      const hash = hashRefreshToken('sample');
      expect(safeCompareTokenHash(hash, hash)).toBe(true);
    });

    it('should return false for different hashes', () => {
      const a = hashRefreshToken('sample-a');
      const b = hashRefreshToken('sample-b');
      expect(safeCompareTokenHash(a, b)).toBe(false);
    });
  });

  describe('isStoredRefreshTokenMatch', () => {
    it('should match hashed stored value', () => {
      const token = 'refresh-token-123';
      const storedHash = hashRefreshToken(token);
      expect(isStoredRefreshTokenMatch(storedHash, token)).toBe(true);
    });

    it('should reject legacy plaintext stored token', () => {
      const token = 'legacy-plain-token';
      expect(isStoredRefreshTokenMatch(token, token)).toBe(false);
    });

    it('should return false for mismatched token', () => {
      const storedHash = hashRefreshToken('token-a');
      expect(isStoredRefreshTokenMatch(storedHash, 'token-b')).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { jwksService } from '@modules/auth/jwks';
import { authConfig } from '@config/env';

describe('jwksService', () => {
  it('returns all active/previous access and refresh public keys as JWKS', () => {
    const jwks = jwksService.getPublicJwks();

    const publishedKids = [
      ...authConfig.keyRings.access.keys,
      ...authConfig.keyRings.refresh.keys,
    ]
      .filter((key) => key.status === 'active' || key.status === 'previous')
      .map((key) => key.kid);

    expect(jwks.keys.length).toBeGreaterThan(0);
    for (const kid of publishedKids) {
      const key = jwks.keys.find((candidate) => candidate.kid === kid);
      expect(key).toBeDefined();
      expect(key?.alg).toBe(authConfig.jwt.algorithm);
      expect(key?.use).toBe('sig');
    }
  });
});

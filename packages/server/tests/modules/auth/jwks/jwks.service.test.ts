import { describe, expect, it } from 'vitest';
import { jwksService } from '@modules/auth/jwks';
import { authConfig } from '@config/env';

describe('jwksService', () => {
  it('returns access and refresh public keys as JWKS', () => {
    const jwks = jwksService.getPublicJwks();

    expect(jwks.keys).toHaveLength(2);

    const accessKey = jwks.keys.find((key) => key.kid === authConfig.accessToken.keyId);
    const refreshKey = jwks.keys.find((key) => key.kid === authConfig.refreshToken.keyId);

    expect(accessKey).toBeDefined();
    expect(refreshKey).toBeDefined();
    expect(accessKey?.alg).toBe(authConfig.jwt.algorithm);
    expect(refreshKey?.alg).toBe(authConfig.jwt.algorithm);
    expect(accessKey?.use).toBe('sig');
    expect(refreshKey?.use).toBe('sig');
  });
});

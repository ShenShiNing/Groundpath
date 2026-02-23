import { createPublicKey } from 'crypto';
import { authConfig } from '@config/env';

interface JwksKey {
  kid: string;
  alg: string;
  use: 'sig';
  [key: string]: unknown;
}

interface JwksPayload {
  keys: JwksKey[];
}

function createJwksKey(publicKeyPem: string, keyId: string): JwksKey {
  const jwk = createPublicKey(publicKeyPem).export({ format: 'jwk' }) as Record<string, unknown>;
  return {
    ...jwk,
    kid: keyId,
    alg: authConfig.jwt.algorithm,
    use: 'sig',
  };
}

export const jwksService = {
  getPublicJwks(): JwksPayload {
    return {
      keys: [
        createJwksKey(authConfig.accessToken.publicKey, authConfig.accessToken.keyId),
        createJwksKey(authConfig.refreshToken.publicKey, authConfig.refreshToken.keyId),
      ],
    };
  },
};

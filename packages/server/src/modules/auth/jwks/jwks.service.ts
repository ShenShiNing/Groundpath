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
    const publishedKeys = [
      ...authConfig.keyRings.access.keys,
      ...authConfig.keyRings.refresh.keys,
    ].filter((key) => key.status === 'active' || key.status === 'previous');

    const unique = new Map<string, JwksKey>();
    for (const key of publishedKeys) {
      const mapKey = `${key.kid}:${key.publicKey}`;
      if (!unique.has(mapKey)) {
        unique.set(mapKey, createJwksKey(key.publicKey, key.kid));
      }
    }

    return {
      keys: [...unique.values()],
    };
  },
};

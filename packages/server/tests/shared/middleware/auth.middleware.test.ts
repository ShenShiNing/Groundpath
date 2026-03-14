import { describe, expect, it } from 'vitest';
import { isTokenRevokedByTimestamp } from '@core/middleware/auth.middleware';

describe('auth.middleware revocation timestamp guard', () => {
  it('does not revoke freshly issued tokens when the database clock is a few seconds ahead', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfter = new Date((tokenIatSeconds + 5) * 1000);

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfter)).toBe(false);
  });

  it('still revokes tokens that were clearly issued before tokenValidAfter', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfter = new Date((tokenIatSeconds + 30) * 1000);

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfter)).toBe(true);
  });

  it('keeps same-second tokens valid after flooring the database timestamp', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfter = new Date(tokenIatSeconds * 1000 + 900);

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfter)).toBe(false);
  });
});

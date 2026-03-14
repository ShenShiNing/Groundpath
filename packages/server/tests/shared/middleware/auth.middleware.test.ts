import { describe, expect, it } from 'vitest';
import { isTokenRevokedByTimestamp } from '@core/middleware/auth.middleware';

describe('auth.middleware revocation timestamp guard', () => {
  it('does not revoke freshly issued tokens when the database clock is a few seconds ahead', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfterEpoch = tokenIatSeconds + 5;

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfterEpoch)).toBe(false);
  });

  it('still revokes tokens that were clearly issued before tokenValidAfter', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfterEpoch = tokenIatSeconds + 30;

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfterEpoch)).toBe(true);
  });

  it('keeps same-second tokens valid', () => {
    const tokenIatSeconds = 1_710_000_000;
    const tokenValidAfterEpoch = tokenIatSeconds;

    expect(isTokenRevokedByTimestamp(tokenIatSeconds, tokenValidAfterEpoch)).toBe(false);
  });

  it('returns false when tokenValidAfterEpoch is null', () => {
    expect(isTokenRevokedByTimestamp(1_710_000_000, null)).toBe(false);
  });
});

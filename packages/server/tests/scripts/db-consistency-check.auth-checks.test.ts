import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.hoisted(() => vi.fn());

vi.mock('@core/db', () => ({
  db: {
    execute: executeMock,
  },
}));

import { checkOrphanUserAuths } from '../../src/scripts/db-consistency-check/auth.checks';

describe('checkOrphanUserAuths', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('passes when no orphan auth rows exist', async () => {
    executeMock.mockResolvedValue([[]]);

    const result = await checkOrphanUserAuths();

    expect(result).toEqual({
      name: '15. Orphan user_auths (missing user)',
      passed: true,
      count: 0,
      details: [],
    });
  });

  it('reports orphan auth rows with actionable details', async () => {
    executeMock.mockResolvedValue([
      [
        {
          id: 'auth-1',
          user_id: 'user-missing',
          auth_type: 'google',
          auth_id: 'google-123',
        },
      ],
    ]);

    const result = await checkOrphanUserAuths();

    expect(result.passed).toBe(false);
    expect(result.count).toBe(1);
    expect(result.details).toEqual(['auth=auth-1 user=user-missing type=google authId=google-123']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('../../../src/shared/db/index.ts', () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import { afterTransactionCommit, withTransaction } from '@shared/db/db.utils';

describe('db.utils transaction hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs after-commit callbacks after a managed transaction resolves', async () => {
    const callOrder: string[] = [];
    const managedTx = {};

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(managedTx)
    );

    const result = await withTransaction(async (tx) => {
      callOrder.push('body');
      await afterTransactionCommit(() => {
        callOrder.push('after-commit');
      }, tx);

      return 'done';
    });

    expect(result).toBe('done');
    expect(callOrder).toEqual(['body', 'after-commit']);
  });

  it('does not run after-commit callbacks when the transaction rolls back', async () => {
    const callOrder: string[] = [];
    const managedTx = {};

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(managedTx)
    );

    await expect(
      withTransaction(async (tx) => {
        await afterTransactionCommit(() => {
          callOrder.push('after-commit');
        }, tx);

        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');

    expect(callOrder).toEqual([]);
  });
});

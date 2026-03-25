import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('../../../src/core/db/index.ts', () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import { afterTransactionCommit, withTransaction } from '@core/db/db.utils';

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

  it('rethrows a single after-commit callback failure', async () => {
    const managedTx = {};
    const callbackError = new Error('after-commit failed');

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(managedTx)
    );

    await expect(
      withTransaction(async (tx) => {
        await afterTransactionCommit(() => {
          throw callbackError;
        }, tx);

        return 'done';
      })
    ).rejects.toBe(callbackError);
  });

  it('aggregates multiple after-commit callback failures', async () => {
    const callOrder: string[] = [];
    const managedTx = {};
    const firstError = new Error('first after-commit failure');
    const secondError = new Error('second after-commit failure');

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(managedTx)
    );

    let thrown: unknown;

    try {
      await withTransaction(async (tx) => {
        await afterTransactionCommit(() => {
          callOrder.push('first');
          throw firstError;
        }, tx);
        await afterTransactionCommit(() => {
          callOrder.push('second');
          throw secondError;
        }, tx);

        return 'done';
      });
    } catch (error) {
      thrown = error;
    }

    expect(callOrder).toEqual(['first', 'second']);
    expect(thrown).toBeInstanceOf(AggregateError);

    const aggregateError = thrown as AggregateError;
    expect(aggregateError.message).toBe('2 after-commit callbacks failed');
    expect(aggregateError.errors).toEqual([firstError, secondError]);
  });
});

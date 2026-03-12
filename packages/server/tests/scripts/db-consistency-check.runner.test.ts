import { describe, expect, it, vi } from 'vitest';
import { runDatabaseConsistencyCheck } from '../../src/scripts/db-consistency-check/runner';
import type {
  CheckResult,
  CounterSyncSummary,
  DbConsistencyRunnerDeps,
} from '../../src/scripts/db-consistency-check/types';

function createDeps(overrides: Partial<DbConsistencyRunnerDeps> = {}) {
  const log = vi.fn((message?: unknown, ...optionalParams: unknown[]) => {
    void message;
    void optionalParams;
  });
  const error = vi.fn((message?: unknown, ...optionalParams: unknown[]) => {
    void message;
    void optionalParams;
  });

  return {
    runChecks: vi.fn(async (): Promise<CheckResult[]> => []),
    syncCounters: vi.fn(
      async (): Promise<CounterSyncSummary> => ({
        total: 0,
        synced: 0,
        errors: 0,
      })
    ),
    closeDatabase: vi.fn(async () => {}),
    output: {
      log,
      error,
    },
    ...overrides,
  } satisfies DbConsistencyRunnerDeps;
}

describe('runDatabaseConsistencyCheck', () => {
  it('returns 0 when all checks pass', async () => {
    const deps = createDeps();

    const exitCode = await runDatabaseConsistencyCheck([], deps);

    expect(exitCode).toBe(0);
    expect(deps.syncCounters).not.toHaveBeenCalled();
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('returns 1 when issues are found without --fix', async () => {
    const deps = createDeps({
      runChecks: vi.fn(
        async (): Promise<CheckResult[]> => [
          {
            name: '1. Sample check',
            passed: false,
            count: 2,
            details: ['issue-a', 'issue-b'],
          },
        ]
      ),
    });

    const exitCode = await runDatabaseConsistencyCheck([], deps);

    expect(exitCode).toBe(1);
    expect(deps.syncCounters).not.toHaveBeenCalled();
    expect(deps.output.log).toHaveBeenCalledWith('[FAIL] 1. Sample check: 2 issue(s)');
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('runs counter sync and returns 0 when --fix is provided', async () => {
    const deps = createDeps({
      runChecks: vi.fn(
        async (): Promise<CheckResult[]> => [
          {
            name: '1. Counter mismatch',
            passed: false,
            count: 1,
            details: ['kb=kb-1 stored=1 actual=2'],
          },
        ]
      ),
      syncCounters: vi.fn(
        async (): Promise<CounterSyncSummary> => ({
          total: 3,
          synced: 2,
          errors: 1,
        })
      ),
    });

    const exitCode = await runDatabaseConsistencyCheck(['--fix'], deps);

    expect(exitCode).toBe(0);
    expect(deps.syncCounters).toHaveBeenCalledTimes(1);
    expect(deps.output.log).toHaveBeenCalledWith('Counter sync completed: 2/3 synced, 1 errors');
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('returns 1 and still closes the database when checks throw', async () => {
    const deps = createDeps({
      runChecks: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    const exitCode = await runDatabaseConsistencyCheck([], deps);

    expect(exitCode).toBe(1);
    expect(deps.output.error).toHaveBeenCalledWith('\nError:', 'boom');
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });
});

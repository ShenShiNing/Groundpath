import type { CheckResult, CounterSyncSummary, DbConsistencyOutput } from './types';

export function printDbConsistencyHeader(output: DbConsistencyOutput): void {
  output.log('Database Consistency Check');
  output.log('=========================\n');
}

export function printDbConsistencyReport(
  results: CheckResult[],
  output: DbConsistencyOutput
): { hasIssues: boolean; passedCount: number } {
  output.log('\n--- Report ---\n');

  let hasIssues = false;
  for (const result of results) {
    const status = result.passed ? '[PASS]' : '[FAIL]';
    output.log(`${status} ${result.name}: ${result.count} issue(s)`);

    if (!result.passed && result.details) {
      for (const detail of result.details.slice(0, 10)) {
        output.log(`       ${detail}`);
      }
      if (result.details.length > 10) {
        output.log(`       ... and ${result.details.length - 10} more`);
      }
    }

    if (!result.passed) {
      hasIssues = true;
    }
  }

  const passedCount = results.filter((result) => result.passed).length;
  output.log(`\nSummary: ${passedCount}/${results.length} checks passed`);

  return { hasIssues, passedCount };
}

export function printCounterFixSummary(
  summary: CounterSyncSummary,
  output: DbConsistencyOutput
): void {
  output.log('\n--- Fixing counter mismatches ---\n');
  output.log(
    `Counter sync completed: ${summary.synced}/${summary.total} synced, ${summary.errors} errors`
  );
}

export function printDbConsistencyError(error: unknown, output: DbConsistencyOutput): void {
  output.error('\nError:', error instanceof Error ? error.message : error);
}

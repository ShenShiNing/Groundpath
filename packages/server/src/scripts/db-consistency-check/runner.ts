import { counterSyncService } from '@modules/knowledge-base';
import { closeDatabase } from '@shared/db';
import { runDatabaseConsistencyChecks } from './checks';
import {
  printCounterFixSummary,
  printDbConsistencyError,
  printDbConsistencyHeader,
  printDbConsistencyReport,
} from './report';
import type { DbConsistencyRunnerDeps } from './types';

const defaultDeps: DbConsistencyRunnerDeps = {
  runChecks: runDatabaseConsistencyChecks,
  syncCounters: async () => counterSyncService.syncAll(),
  closeDatabase,
  output: console,
};

export function parseDbConsistencyArgs(args: string[]): { fix: boolean } {
  return {
    fix: args.includes('--fix'),
  };
}

export async function runDatabaseConsistencyCheck(
  args: string[],
  deps: DbConsistencyRunnerDeps = defaultDeps
): Promise<number> {
  const { fix } = parseDbConsistencyArgs(args);

  printDbConsistencyHeader(deps.output);

  try {
    const results = await deps.runChecks();
    const { hasIssues } = printDbConsistencyReport(results, deps.output);

    if (fix && hasIssues) {
      const summary = await deps.syncCounters();
      printCounterFixSummary(summary, deps.output);
    }

    return hasIssues && !fix ? 1 : 0;
  } catch (error) {
    printDbConsistencyError(error, deps.output);
    return 1;
  } finally {
    await deps.closeDatabase();
  }
}

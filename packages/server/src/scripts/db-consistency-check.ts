/**
 * CLI script to check database consistency
 *
 * Usage:
 *   pnpm -F @knowledge-agent/server db:check [options]
 *
 * Options:
 *   --fix    Auto-fix counter mismatches using counterSyncService.syncAll()
 *
 * Exit codes:
 *   0 - All checks passed (or fixed with --fix)
 *   1 - Issues found (or error occurred)
 */

import { databaseConfig, isEnvLoaded } from '@shared/config/env';

function getBootstrapError(): string | null {
  if (!isEnvLoaded()) {
    return 'Error: Environment not loaded. Check .env file exists.';
  }

  if (!databaseConfig.url) {
    return 'Error: DATABASE_URL not configured.\nMake sure .env file exists with DATABASE_URL set.';
  }

  return null;
}

async function main() {
  const bootstrapError = getBootstrapError();

  if (bootstrapError) {
    console.error(bootstrapError);
    process.exit(1);
  }

  const { runDatabaseConsistencyCheck } = await import('./db-consistency-check/runner');
  const exitCode = await runDatabaseConsistencyCheck(process.argv.slice(2));
  process.exit(exitCode);
}

void main();

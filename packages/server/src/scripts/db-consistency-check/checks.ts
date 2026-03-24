import {
  checkDuplicateActiveUserEmails,
  checkDuplicateActiveUsernames,
  checkOrphanUserAuths,
} from './auth.checks';
import { checkOrphanBackfillItems, checkOrphanBackfillRuns } from './backfill.checks';
import { documentConsistencyChecks } from './document.checks';
import { documentIndexConsistencyChecks } from './document-index.checks';
import type { CheckResult } from './types';

const checks = [
  ...documentConsistencyChecks,
  ...documentIndexConsistencyChecks,
  checkDuplicateActiveUserEmails,
  checkDuplicateActiveUsernames,
  checkOrphanUserAuths,
  checkOrphanBackfillRuns,
  checkOrphanBackfillItems,
] as const;

export async function runDatabaseConsistencyChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    results.push(await check());
  }

  return results;
}

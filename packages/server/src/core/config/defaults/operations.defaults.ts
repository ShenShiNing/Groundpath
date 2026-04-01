// ---------------------------------------------------------------------------
// Queue, backfill, logging retention, and structured-RAG observability defaults
// ---------------------------------------------------------------------------

/** Queue retry / backoff policy (excludes QUEUE_CONCURRENCY — stays in env) */
export const queueDefaults = {
  maxRetries: 3,
  backoffDelay: 5_000,
  backoffType: 'exponential' as const,
} as const;

/** Backfill batch parameters */
export const backfillDefaults = {
  batchSize: 100,
  enqueueDelayMs: 0,
} as const;

/** Log retention periods and cleanup batch size */
export const loggingDefaults = {
  retention: {
    loginDays: 90,
    operationDays: 365,
    systemDays: 30,
  },
  cleanup: {
    batchSize: 1_000,
  },
  partitioning: {
    futureMonths: 6,
  },
} as const;

/** Structured-RAG alert windows, thresholds, and report period */
export const structuredRagObservabilityDefaults = {
  rollupBucketMinutes: 15,
  alertWindowHours: 24,
  alertCooldownHours: 6,
  alertReminderHours: 24,
  thresholds: {
    fallbackRatio: 35,
    budgetExhaustionRate: 10,
    providerErrorRate: 3,
    freshnessLagMs: 300_000,
  },
  reportDefaultDays: 30,
} as const;

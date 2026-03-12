export interface CheckResult {
  name: string;
  passed: boolean;
  count: number;
  details?: string[];
}

export interface CounterSyncSummary {
  total: number;
  synced: number;
  errors: number;
}

export interface DbConsistencyOutput {
  log: (message?: unknown, ...optionalParams: unknown[]) => void;
  error: (message?: unknown, ...optionalParams: unknown[]) => void;
}

export interface DbConsistencyRunnerDeps {
  runChecks: () => Promise<CheckResult[]>;
  syncCounters: () => Promise<CounterSyncSummary>;
  closeDatabase: () => Promise<void>;
  output: DbConsistencyOutput;
}

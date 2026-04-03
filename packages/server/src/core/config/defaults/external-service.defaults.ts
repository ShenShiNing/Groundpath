// ---------------------------------------------------------------------------
// External service timeout / retry policy defaults
// ---------------------------------------------------------------------------

export const externalServiceDefaults = {
  llm: {
    timeoutMs: 30_000,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
  },
  embedding: {
    timeoutMs: 30_000,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
  },
  storage: {
    timeoutMs: 20_000,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
  },
  webSearch: {
    timeoutMs: 15_000,
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
  },
  modelFetch: {
    timeoutMs: 15_000,
    maxRetries: 1,
    baseDelayMs: 500,
    maxDelayMs: 2_000,
  },
  vlm: {
    timeoutMs: 30_000,
    maxRetries: 2,
    baseDelayMs: 1_000,
    maxDelayMs: 15_000,
  },
} as const;

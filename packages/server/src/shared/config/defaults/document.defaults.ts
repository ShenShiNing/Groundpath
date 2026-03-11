// ---------------------------------------------------------------------------
// Document processing, indexing, RAG search, and Document-AI business defaults
// ---------------------------------------------------------------------------

/** Core document upload & chunking limits */
export const documentDefaults = {
  maxSize: 22_020_096,
  textContentMaxLength: 500_000,
  textPreviewMaxLength: 50_000,
  chunkSize: 512,
  chunkOverlap: 50,
  vectorBatchSize: 20,
  processingTimeoutMinutes: 30,
  processingRecoveryBatchSize: 100,
} as const;

/** Structured-RAG indexing parameters */
export const documentIndexDefaults = {
  routeTokenThreshold: 5_000,
  charsPerToken: 4,
  pdfTimeoutMs: 30_000,
  pdfConcurrency: 2,
} as const;

/** Semantic search defaults */
export const ragDefaults = {
  searchDefaultLimit: 5,
  searchDefaultScoreThreshold: 0.5,
} as const;

/** Document-AI (summary, analysis, generation) parameters */
export const documentAIDefaults = {
  maxContextTokens: 8_000,
  charsPerToken: 3,
  summaryBatchSize: 5,
  maxAnalysisChars: 30_000,
  cacheTtlMs: 3_600_000,
  cacheCleanupIntervalMs: 300_000,
  heartbeatIntervalMs: 15_000,
} as const;

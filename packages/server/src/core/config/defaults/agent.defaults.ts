// ---------------------------------------------------------------------------
// Agent executor & VLM (vision-language model) business defaults
// ---------------------------------------------------------------------------

/** Agent orchestration parameters (excludes TAVILY_API_KEY — stays in env) */
export const agentDefaults = {
  maxIterations: 5,
  maxStructuredRounds: 3,
  maxFallbackRounds: 1,
  toolTimeout: 15_000,
  sseHeartbeatIntervalMs: 15_000,
  maxNodeReadTokens: 1_200,
  refFollowMaxDepth: 3,
  refFollowMaxNodes: 20,
  tavilyMaxResults: 5,
  tavilyContentMaxLength: 2_000,
  citationOutlineScoreCeiling: 30,
  citationNodeReadBaseScore: 0.7,
  citationRefFollowBaseScore: 0.6,
  citationMinDocuments: 3,
  citationMinScore: 0.35,
  citationParentScoreAdvantage: 0.15,
} as const;

/** VLM processing parameters (excludes provider/model/apiKey/baseUrl — stay in env) */
export const vlmDefaults = {
  timeoutMs: 30_000,
  concurrency: 2,
  maxRetries: 2,
  maxImageSizeBytes: 10_485_760,
  maxTokens: 1_024,
} as const;

export interface StructuredRagDashboardRecentEvent {
  id: string;
  event: string;
  message: string;
  createdAt: Date;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
}

export interface StructuredRagDashboardAlert {
  code: 'fallback_ratio' | 'budget_exhaustion' | 'provider_error' | 'freshness_lag';
  severity: 'info' | 'warn' | 'error';
  title: string;
  description: string;
  value: number;
  threshold: number;
}

export interface StructuredRagDashboardTrendPoint {
  label: string;
  bucketStart: Date;
  bucketEnd: Date;
  agentExecutions: number;
  fallbackRatio: number;
  structuredCoverage: number;
  indexBuilds: number;
}

export interface StructuredRagDashboardKnowledgeBaseBreakdown {
  knowledgeBaseId: string;
  agentExecutions: number;
  fallbackRatio: number;
  providerErrorRate: number;
  structuredCoverage: number;
  avgFreshnessLagMs: number;
}

export interface StructuredRagLongTermReport {
  generatedAt: Date;
  windowDays: number;
  filters: {
    knowledgeBaseId: string | null;
    userScoped: boolean;
  };
  highlights: string[];
  summary: StructuredRagDashboardSummary;
  markdown: string;
}

export interface StructuredRagDashboardSummary {
  windowHours: number;
  trendGranularity: 'hour' | 'day';
  filters: {
    knowledgeBaseId: string | null;
  };
  agent: {
    totalExecutions: number;
    fallbackRatio: number;
    budgetExhaustionRate: number;
    toolTimeoutRate: number;
    providerErrorRate: number;
    insufficientEvidenceRate: number;
    avgDurationMs: number;
    avgFinalCitationCount: number;
    avgRetrievedCitationCount: number;
  };
  index: {
    totalBuilds: number;
    parseSuccessRate: number;
    structuredRequestRate: number;
    structuredCoverage: number;
    avgParseDurationMs: number;
    avgFreshnessLagMs: number;
    graphBuilds: number;
    totalNodes: number;
    totalEdges: number;
  };
  alerts: StructuredRagDashboardAlert[];
  trend: StructuredRagDashboardTrendPoint[];
  knowledgeBaseBreakdown: StructuredRagDashboardKnowledgeBaseBreakdown[];
  recentEvents: StructuredRagDashboardRecentEvent[];
}

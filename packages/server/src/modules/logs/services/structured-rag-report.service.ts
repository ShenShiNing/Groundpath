import { structuredRagObservabilityConfig } from '@config/env';
import type { StructuredRagLongTermReport } from '@knowledge-agent/shared/types';
import { structuredRagDashboardService } from './structured-rag-dashboard.service';

export interface StructuredRagReportParams {
  userId?: string;
  days?: number;
  knowledgeBaseId?: string;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export const structuredRagReportService = {
  async generateReport(params: StructuredRagReportParams = {}): Promise<StructuredRagLongTermReport> {
    const windowDays = params.days ?? structuredRagObservabilityConfig.reportDefaultDays;
    const summary = await structuredRagDashboardService.getSummary({
      userId: params.userId,
      hours: windowDays * 24,
      recentLimit: 12,
      knowledgeBaseId: params.knowledgeBaseId,
    });

    const highlights: string[] = [];
    if (summary.alerts.length === 0) {
      highlights.push('No active Structured RAG alerts in the selected report window.');
    } else {
      for (const alert of summary.alerts) {
        highlights.push(`${alert.title}: current ${alert.value.toFixed(1)}, threshold ${alert.threshold.toFixed(1)}.`);
      }
    }

    if (summary.knowledgeBaseBreakdown[0]) {
      highlights.push(
        `Highest-volume knowledge base: ${summary.knowledgeBaseBreakdown[0].knowledgeBaseId} (${summary.knowledgeBaseBreakdown[0].agentExecutions} executions).`
      );
    }

    const markdown = [
      `# Structured RAG Report`,
      ``,
      `Generated at: ${new Date().toISOString()}`,
      `Window: last ${windowDays} days`,
      `Knowledge base filter: ${params.knowledgeBaseId ?? 'all'}`,
      `User scope: ${params.userId ? 'user' : 'global'}`,
      ``,
      `## Highlights`,
      ...highlights.map((line) => `- ${line}`),
      ``,
      `## Agent`,
      `- Total executions: ${summary.agent.totalExecutions}`,
      `- Fallback ratio: ${formatPercent(summary.agent.fallbackRatio)}`,
      `- Budget exhaustion rate: ${formatPercent(summary.agent.budgetExhaustionRate)}`,
      `- Tool timeout rate: ${formatPercent(summary.agent.toolTimeoutRate)}`,
      `- Provider error rate: ${formatPercent(summary.agent.providerErrorRate)}`,
      `- Insufficient evidence rate: ${formatPercent(summary.agent.insufficientEvidenceRate)}`,
      `- Average duration: ${formatMs(summary.agent.avgDurationMs)}`,
      ``,
      `## Index`,
      `- Total builds: ${summary.index.totalBuilds}`,
      `- Parse success rate: ${formatPercent(summary.index.parseSuccessRate)}`,
      `- Structured coverage: ${formatPercent(summary.index.structuredCoverage)}`,
      `- Average parse duration: ${formatMs(summary.index.avgParseDurationMs)}`,
      `- Average freshness lag: ${formatMs(summary.index.avgFreshnessLagMs)}`,
      `- Graph builds: ${summary.index.graphBuilds}`,
      `- Total nodes: ${summary.index.totalNodes}`,
      `- Total edges: ${summary.index.totalEdges}`,
      ``,
      `## Knowledge Base Breakdown`,
      ...summary.knowledgeBaseBreakdown.map(
        (item) =>
          `- ${item.knowledgeBaseId}: executions=${item.agentExecutions}, fallback=${formatPercent(item.fallbackRatio)}, coverage=${formatPercent(item.structuredCoverage)}, providerErrors=${formatPercent(item.providerErrorRate)}, freshness=${formatMs(item.avgFreshnessLagMs)}`
      ),
      ``,
      `## Trend`,
      ...summary.trend.map(
        (point) =>
          `- ${point.label}: executions=${point.agentExecutions}, fallback=${formatPercent(point.fallbackRatio)}, coverage=${formatPercent(point.structuredCoverage)}, indexBuilds=${point.indexBuilds}`
      ),
    ].join('\n');

    return {
      generatedAt: new Date(),
      windowDays,
      filters: {
        knowledgeBaseId: params.knowledgeBaseId ?? null,
        userScoped: !!params.userId,
      },
      highlights,
      summary,
      markdown,
    };
  },
};

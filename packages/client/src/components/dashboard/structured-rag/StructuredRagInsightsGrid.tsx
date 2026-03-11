import { FileBarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StructuredRagDashboardSummary } from '@knowledge-agent/shared/types';
import type { StructuredRagRecentEventItem } from './utils';
import { formatMs, formatPercent } from './utils';

interface StructuredRagInsightsGridProps {
  summary: StructuredRagDashboardSummary;
  recentEvents: StructuredRagRecentEventItem[];
  maxTrendExecutions: number;
}

export function StructuredRagInsightsGrid({
  summary,
  recentEvents,
  maxTrendExecutions,
}: StructuredRagInsightsGridProps) {
  const { t } = useTranslation('dashboard');

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t('structuredRag.trend.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.trend.map((point) => (
            <div key={`${point.bucketStart.toString()}-${point.label}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{point.label}</span>
                <div className="flex items-center gap-3">
                  <span>
                    {t('structuredRag.trend.executions', { count: point.agentExecutions })}
                  </span>
                  <span>
                    {t('structuredRag.trend.fallback', {
                      value: formatPercent(point.fallbackRatio),
                    })}
                  </span>
                  <span>
                    {t('structuredRag.trend.coverage', {
                      value: formatPercent(point.structuredCoverage),
                    })}
                  </span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{
                    width: `${Math.max((point.agentExecutions / maxTrendExecutions) * 100, 6)}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {t('structuredRag.trend.granularity', {
              granularity:
                summary.trendGranularity === 'day'
                  ? t('structuredRag.trend.dayGranularity')
                  : t('structuredRag.trend.hourGranularity'),
            })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('structuredRag.recent.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('structuredRag.recent.empty')}</p>
          ) : (
            recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.event}</Badge>
                  {event.stopReason ? <Badge variant="secondary">{event.stopReason}</Badge> : null}
                  {event.routeMode ? <Badge variant="secondary">{event.routeMode}</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{event.message}</p>
                {event.durationMs != null ? (
                  <p className="text-xs text-muted-foreground">
                    {t('structuredRag.recent.duration', { duration: formatMs(event.durationMs) })}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('structuredRag.detail.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('structuredRag.detail.avgFinalCitations')}
            </span>
            <span className="font-medium">{summary.agent.avgFinalCitationCount.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('structuredRag.detail.avgRetrievedCitations')}
            </span>
            <span className="font-medium">
              {summary.agent.avgRetrievedCitationCount.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('structuredRag.detail.providerErrorRate')}
            </span>
            <span className="font-medium">{formatPercent(summary.agent.providerErrorRate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('structuredRag.detail.insufficientEvidenceRate')}
            </span>
            <span className="font-medium">
              {formatPercent(summary.agent.insufficientEvidenceRate)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('structuredRag.detail.graphBuilds')}</span>
            <span className="font-medium">{summary.index.graphBuilds}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('structuredRag.detail.totalNodes')}</span>
            <span className="font-medium">{summary.index.totalNodes}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('structuredRag.detail.totalEdges')}</span>
            <span className="font-medium">{summary.index.totalEdges}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t('structuredRag.detail.avgAgentDuration')}
            </span>
            <span className="font-medium">{formatMs(summary.agent.avgDurationMs)}</span>
          </div>
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileBarChart2 className="size-3.5" />
              <span>{t('structuredRag.detail.note')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

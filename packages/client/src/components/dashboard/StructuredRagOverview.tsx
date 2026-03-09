import { startTransition, useState, type ReactNode } from 'react';
import { Activity, Download, FileBarChart2, Gauge, Layers3, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { logsApi } from '@/api';
import { useKnowledgeBases, useStructuredRagDashboard } from '@/hooks';

function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-start justify-between gap-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}

export function StructuredRagOverview() {
  const { t } = useTranslation('dashboard');
  const [hours, setHours] = useState(24);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const { data: knowledgeBases = [] } = useKnowledgeBases();
  const selectedKnowledgeBaseId = knowledgeBaseId === 'all' ? undefined : knowledgeBaseId;
  const { data, isLoading, isError } = useStructuredRagDashboard({
    hours,
    recentLimit: 6,
    knowledgeBaseId: selectedKnowledgeBaseId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('structuredRag.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('structuredRag.error')}</p>
        </CardContent>
      </Card>
    );
  }

  const recentEvents = data.recentEvents.map((event) => {
    const stopReason =
      typeof event.metadata?.stopReason === 'string' ? event.metadata.stopReason : null;
    const routeMode = typeof event.metadata?.routeMode === 'string' ? event.metadata.routeMode : null;
    return { ...event, stopReason, routeMode };
  });

  const maxTrendExecutions = Math.max(...data.trend.map((point) => point.agentExecutions), 1);

  async function exportLongTermReport(days: number) {
    setIsExporting(true);
    try {
      const report = await logsApi.getStructuredRagReport({
        days,
        knowledgeBaseId: selectedKnowledgeBaseId,
      });
      const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `structured-rag-report-${days}d.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t('structuredRag.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('structuredRag.subtitle', { hours: data.windowHours })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(hours)}
            onValueChange={(value) => {
              startTransition(() => {
                setHours(Number(value));
              });
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">{t('structuredRag.filters.lastHours', { hours: 6 })}</SelectItem>
              <SelectItem value="24">{t('structuredRag.filters.lastHours', { hours: 24 })}</SelectItem>
              <SelectItem value="72">{t('structuredRag.filters.lastHours', { hours: 72 })}</SelectItem>
              <SelectItem value="168">{t('structuredRag.filters.lastHours', { hours: 168 })}</SelectItem>
              <SelectItem value="720">{t('structuredRag.filters.lastHours', { hours: 720 })}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={knowledgeBaseId}
            onValueChange={(value) => {
              startTransition(() => {
                setKnowledgeBaseId(value);
              });
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('structuredRag.filters.allKnowledgeBases')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('structuredRag.filters.allKnowledgeBases')}</SelectItem>
              {knowledgeBases.map((kb) => (
                <SelectItem key={kb.id} value={kb.id}>
                  {kb.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{t('structuredRag.window', { hours: data.windowHours })}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            disabled={isExporting}
            onClick={() => void exportLongTermReport(Math.max(Math.ceil(hours / 24), 30))}
          >
            <Download className="mr-1 size-3.5" />
            {t('structuredRag.report.download')}
          </Button>
        </div>
      </div>

      {data.alerts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.alerts.map((alert) => (
            <div
              key={alert.code}
              className="rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    alert.severity === 'error'
                      ? 'destructive'
                      : alert.severity === 'warn'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {alert.severity}
                </Badge>
                <span className="font-medium">{t(`structuredRag.alerts.${alert.code}.title`)}</span>
                <span className="text-muted-foreground">
                  {t(`structuredRag.alerts.${alert.code}.value`, {
                    value:
                      alert.code === 'freshness_lag'
                        ? formatMs(alert.value)
                        : formatPercent(alert.value),
                    threshold:
                      alert.code === 'freshness_lag'
                        ? formatMs(alert.threshold)
                        : formatPercent(alert.threshold),
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t('structuredRag.alerts.empty')}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('structuredRag.cards.fallbackRatio.title')}
          value={formatPercent(data.agent.fallbackRatio)}
          subtitle={t('structuredRag.cards.fallbackRatio.subtitle', {
            count: data.agent.totalExecutions,
          })}
          icon={<Activity className="size-4" />}
        />
        <StatCard
          title={t('structuredRag.cards.budgetExhaustion.title')}
          value={formatPercent(data.agent.budgetExhaustionRate)}
          subtitle={t('structuredRag.cards.budgetExhaustion.subtitle', {
            timeoutRate: formatPercent(data.agent.toolTimeoutRate),
          })}
          icon={<TriangleAlert className="size-4" />}
        />
        <StatCard
          title={t('structuredRag.cards.structuredCoverage.title')}
          value={formatPercent(data.index.structuredCoverage)}
          subtitle={t('structuredRag.cards.structuredCoverage.subtitle', {
            parseSuccessRate: formatPercent(data.index.parseSuccessRate),
          })}
          icon={<Layers3 className="size-4" />}
        />
        <StatCard
          title={t('structuredRag.cards.indexFreshness.title')}
          value={formatMs(data.index.avgFreshnessLagMs)}
          subtitle={t('structuredRag.cards.indexFreshness.subtitle', {
            parseDuration: formatMs(data.index.avgParseDurationMs),
          })}
          icon={<Gauge className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('structuredRag.trend.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.trend.map((point) => (
              <div key={`${point.bucketStart.toString()}-${point.label}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{point.label}</span>
                  <div className="flex items-center gap-3">
                    <span>{t('structuredRag.trend.executions', { count: point.agentExecutions })}</span>
                    <span>{t('structuredRag.trend.fallback', { value: formatPercent(point.fallbackRatio) })}</span>
                    <span>{t('structuredRag.trend.coverage', { value: formatPercent(point.structuredCoverage) })}</span>
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
                  data.trendGranularity === 'day'
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
              <span className="text-muted-foreground">{t('structuredRag.detail.avgFinalCitations')}</span>
              <span className="font-medium">{data.agent.avgFinalCitationCount.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.avgRetrievedCitations')}</span>
              <span className="font-medium">{data.agent.avgRetrievedCitationCount.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.providerErrorRate')}</span>
              <span className="font-medium">{formatPercent(data.agent.providerErrorRate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.insufficientEvidenceRate')}</span>
              <span className="font-medium">{formatPercent(data.agent.insufficientEvidenceRate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.graphBuilds')}</span>
              <span className="font-medium">{data.index.graphBuilds}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.totalNodes')}</span>
              <span className="font-medium">{data.index.totalNodes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.totalEdges')}</span>
              <span className="font-medium">{data.index.totalEdges}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('structuredRag.detail.avgAgentDuration')}</span>
              <span className="font-medium">{formatMs(data.agent.avgDurationMs)}</span>
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

      <Card>
        <CardHeader>
          <CardTitle>{t('structuredRag.breakdown.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.knowledgeBaseBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('structuredRag.breakdown.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('structuredRag.breakdown.columns.knowledgeBase')}</TableHead>
                  <TableHead>{t('structuredRag.breakdown.columns.executions')}</TableHead>
                  <TableHead>{t('structuredRag.breakdown.columns.fallback')}</TableHead>
                  <TableHead>{t('structuredRag.breakdown.columns.coverage')}</TableHead>
                  <TableHead>{t('structuredRag.breakdown.columns.providerErrors')}</TableHead>
                  <TableHead>{t('structuredRag.breakdown.columns.freshness')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.knowledgeBaseBreakdown.map((item) => {
                  const kbName =
                    knowledgeBases.find((kb) => kb.id === item.knowledgeBaseId)?.name ??
                    item.knowledgeBaseId;
                  return (
                    <TableRow key={item.knowledgeBaseId}>
                      <TableCell className="max-w-56 truncate">{kbName}</TableCell>
                      <TableCell>{item.agentExecutions}</TableCell>
                      <TableCell>{formatPercent(item.fallbackRatio)}</TableCell>
                      <TableCell>{formatPercent(item.structuredCoverage)}</TableCell>
                      <TableCell>{formatPercent(item.providerErrorRate)}</TableCell>
                      <TableCell>{formatMs(item.avgFreshnessLagMs)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

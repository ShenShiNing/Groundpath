import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { logsApi } from '@/api';
import { useKnowledgeBases, useStructuredRagDashboard } from '@/hooks';
import { StructuredRagAlerts } from './structured-rag/StructuredRagAlerts';
import { StructuredRagBreakdownTable } from './structured-rag/StructuredRagBreakdownTable';
import { StructuredRagHeader } from './structured-rag/StructuredRagHeader';
import { StructuredRagInsightsGrid } from './structured-rag/StructuredRagInsightsGrid';
import { StructuredRagStats } from './structured-rag/StructuredRagStats';
import { normalizeRecentEvents } from './structured-rag/utils';

function StructuredRagOverviewSkeleton() {
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

function StructuredRagOverviewError({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
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
    return <StructuredRagOverviewSkeleton />;
  }

  if (isError || !data) {
    return (
      <StructuredRagOverviewError
        title={t('structuredRag.title')}
        message={t('structuredRag.error')}
      />
    );
  }

  const recentEvents = normalizeRecentEvents(data.recentEvents);
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
      <StructuredRagHeader
        hours={hours}
        knowledgeBaseId={knowledgeBaseId}
        knowledgeBases={knowledgeBases}
        windowHours={data.windowHours}
        isExporting={isExporting}
        onHoursChange={setHours}
        onKnowledgeBaseChange={setKnowledgeBaseId}
        onExport={() => void exportLongTermReport(Math.max(Math.ceil(hours / 24), 30))}
      />
      <StructuredRagAlerts alerts={data.alerts} />
      <StructuredRagStats summary={data} />
      <StructuredRagInsightsGrid
        summary={data}
        recentEvents={recentEvents}
        maxTrendExecutions={maxTrendExecutions}
      />
      <StructuredRagBreakdownTable
        knowledgeBaseBreakdown={data.knowledgeBaseBreakdown}
        knowledgeBases={knowledgeBases}
      />
    </section>
  );
}

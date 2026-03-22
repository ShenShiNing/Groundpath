import type { ReactNode } from 'react';
import { Activity, Gauge, Layers3, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import type { StructuredRagDashboardSummary } from '@groundpath/shared/types';
import { formatMs, formatPercent } from './utils';

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

interface StructuredRagStatsProps {
  summary: StructuredRagDashboardSummary;
}

export function StructuredRagStats({ summary }: StructuredRagStatsProps) {
  const { t } = useTranslation('dashboard');

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title={t('structuredRag.cards.fallbackRatio.title')}
        value={formatPercent(summary.agent.fallbackRatio)}
        subtitle={t('structuredRag.cards.fallbackRatio.subtitle', {
          count: summary.agent.totalExecutions,
        })}
        icon={<Activity className="size-4" />}
      />
      <StatCard
        title={t('structuredRag.cards.budgetExhaustion.title')}
        value={formatPercent(summary.agent.budgetExhaustionRate)}
        subtitle={t('structuredRag.cards.budgetExhaustion.subtitle', {
          timeoutRate: formatPercent(summary.agent.toolTimeoutRate),
        })}
        icon={<TriangleAlert className="size-4" />}
      />
      <StatCard
        title={t('structuredRag.cards.structuredCoverage.title')}
        value={formatPercent(summary.index.structuredCoverage)}
        subtitle={t('structuredRag.cards.structuredCoverage.subtitle', {
          parseSuccessRate: formatPercent(summary.index.parseSuccessRate),
        })}
        icon={<Layers3 className="size-4" />}
      />
      <StatCard
        title={t('structuredRag.cards.indexFreshness.title')}
        value={formatMs(summary.index.avgFreshnessLagMs)}
        subtitle={t('structuredRag.cards.indexFreshness.subtitle', {
          parseDuration: formatMs(summary.index.avgParseDurationMs),
        })}
        icon={<Gauge className="size-4" />}
      />
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { StructuredRagDashboardAlert } from '@knowledge-agent/shared/types';
import { getAlertThresholdLabel, getAlertValueLabel } from './utils';

interface StructuredRagAlertsProps {
  alerts: StructuredRagDashboardAlert[];
}

const structuredRagAlertTranslationKeys = {
  fallback_ratio: {
    title: 'structuredRag.alerts.fallback_ratio.title',
    value: 'structuredRag.alerts.fallback_ratio.value',
  },
  budget_exhaustion: {
    title: 'structuredRag.alerts.budget_exhaustion.title',
    value: 'structuredRag.alerts.budget_exhaustion.value',
  },
  provider_error: {
    title: 'structuredRag.alerts.provider_error.title',
    value: 'structuredRag.alerts.provider_error.value',
  },
  freshness_lag: {
    title: 'structuredRag.alerts.freshness_lag.title',
    value: 'structuredRag.alerts.freshness_lag.value',
  },
} as const satisfies Record<StructuredRagDashboardAlert['code'], { title: string; value: string }>;

export function StructuredRagAlerts({ alerts }: StructuredRagAlertsProps) {
  const { t } = useTranslation('dashboard');

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {t('structuredRag.alerts.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert) => {
        const translationKeys = structuredRagAlertTranslationKeys[alert.code];

        return (
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
              <span className="font-medium">{t(translationKeys.title)}</span>
              <span className="text-muted-foreground">
                {t(translationKeys.value, {
                  value: getAlertValueLabel(alert),
                  threshold: getAlertThresholdLabel(alert),
                })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

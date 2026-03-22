import type {
  StructuredRagDashboardAlert,
  StructuredRagDashboardRecentEvent,
} from '@groundpath/shared/types';

export interface StructuredRagRecentEventItem extends StructuredRagDashboardRecentEvent {
  stopReason: string | null;
  routeMode: string | null;
}

export function formatMs(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }

  return `${Math.round(value)}ms`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function normalizeRecentEvents(
  events: StructuredRagDashboardRecentEvent[]
): StructuredRagRecentEventItem[] {
  return events.map((event) => {
    const stopReason =
      typeof event.metadata?.stopReason === 'string' ? event.metadata.stopReason : null;
    const routeMode =
      typeof event.metadata?.routeMode === 'string' ? event.metadata.routeMode : null;

    return { ...event, stopReason, routeMode };
  });
}

export function getAlertValueLabel(alert: StructuredRagDashboardAlert): string {
  return alert.code === 'freshness_lag' ? formatMs(alert.value) : formatPercent(alert.value);
}

export function getAlertThresholdLabel(alert: StructuredRagDashboardAlert): string {
  return alert.code === 'freshness_lag'
    ? formatMs(alert.threshold)
    : formatPercent(alert.threshold);
}

import { structuredRagObservabilityConfig } from '@config/env';
import { emailService } from '@modules/auth';
import { systemLogRepository } from '../repositories/system-log.repository';
import { systemLogger } from '@shared/logger/system-logger';
import { createLogger } from '@shared/logger';
import { structuredRagReportService } from './structured-rag-report.service';
import type { StructuredRagDashboardAlert } from '@knowledge-agent/shared/types';

const logger = createLogger('structured-rag-alert.service');

export interface StructuredRagAlertResult {
  alertsTriggered: number;
  emailSent: boolean;
  recipients: string[];
  notifiedAlertCodes: string[];
  suppressedAlertCodes: string[];
}

type AlertNotificationReason = 'first_seen' | 'severity_escalated' | 'reminder_due';
type AlertSuppressionReason = 'cooldown' | 'awaiting_reminder';

function severityRank(severity: StructuredRagDashboardAlert['severity']): number {
  switch (severity) {
    case 'error':
      return 3;
    case 'warn':
      return 2;
    default:
      return 1;
  }
}

function formatAlertLine(alert: StructuredRagDashboardAlert, reason: AlertNotificationReason): string {
  return `- ${alert.title} (${alert.code}) severity=${alert.severity} value=${alert.value.toFixed(1)} threshold=${alert.threshold.toFixed(1)} reason=${reason}`;
}

export const structuredRagAlertService = {
  async checkAndNotify(): Promise<StructuredRagAlertResult> {
    const report = await structuredRagReportService.generateReport({
      days: Math.max(1, Math.ceil(structuredRagObservabilityConfig.alertWindowHours / 24)),
    });
    const recipients = structuredRagObservabilityConfig.alertEmailTo;

    if (report.summary.alerts.length === 0) {
      logger.info('Structured RAG alert check completed without active alerts');
      return {
        alertsTriggered: 0,
        emailSent: false,
        recipients,
        notifiedAlertCodes: [],
        suppressedAlertCodes: [],
      };
    }

    const latestSentByCode = new Map(
      (
        await systemLogRepository.getLatestStructuredRagAlertEvents(
          report.summary.alerts.map((alert) => alert.code)
        )
      ).map((entry) => [entry.code, entry])
    );

    const notifyAlerts: Array<{ alert: StructuredRagDashboardAlert; reason: AlertNotificationReason }> = [];
    const suppressedAlerts: Array<{ alert: StructuredRagDashboardAlert; reason: AlertSuppressionReason }> = [];
    const now = Date.now();

    for (const alert of report.summary.alerts) {
      const previous = latestSentByCode.get(alert.code);
      if (!previous) {
        notifyAlerts.push({ alert, reason: 'first_seen' });
        continue;
      }

      const hoursSinceLastSent = (now - previous.createdAt.getTime()) / (60 * 60 * 1000);
      const previousSeverity =
        previous.severity === 'error' || previous.severity === 'warn' || previous.severity === 'info'
          ? previous.severity
          : 'info';

      if (severityRank(alert.severity) > severityRank(previousSeverity)) {
        notifyAlerts.push({ alert, reason: 'severity_escalated' });
        continue;
      }

      if (hoursSinceLastSent >= structuredRagObservabilityConfig.alertReminderHours) {
        notifyAlerts.push({ alert, reason: 'reminder_due' });
        continue;
      }

      suppressedAlerts.push({
        alert,
        reason:
          hoursSinceLastSent < structuredRagObservabilityConfig.alertCooldownHours
            ? 'cooldown'
            : 'awaiting_reminder',
      });
    }

    if (!structuredRagObservabilityConfig.alertsEnabled || recipients.length === 0) {
      logger.warn(
        {
          alertsTriggered: report.summary.alerts.length,
          alertsEnabled: structuredRagObservabilityConfig.alertsEnabled,
          recipients,
        },
        'Structured RAG alerts detected but external delivery is disabled'
      );
      return {
        alertsTriggered: report.summary.alerts.length,
        emailSent: false,
        recipients,
        notifiedAlertCodes: [],
        suppressedAlertCodes: report.summary.alerts.map((alert) => alert.code),
      };
    }

    for (const entry of suppressedAlerts) {
      await systemLogRepository.create({
        level: 'info',
        category: 'performance',
        event: 'structured-rag.alert.suppressed',
        message: `Structured RAG alert suppressed: ${entry.alert.code}`,
        source: 'structured-rag-alert',
        metadata: {
          code: entry.alert.code,
          severity: entry.alert.severity,
          reason: entry.reason,
          value: entry.alert.value,
          threshold: entry.alert.threshold,
        },
      });
    }

    if (notifyAlerts.length === 0) {
      logger.info(
        {
          alertsTriggered: report.summary.alerts.length,
          suppressedAlertCodes: suppressedAlerts.map((entry) => entry.alert.code),
        },
        'Structured RAG alerts are active but all notifications are currently suppressed'
      );
      return {
        alertsTriggered: report.summary.alerts.length,
        emailSent: false,
        recipients,
        notifiedAlertCodes: [],
        suppressedAlertCodes: suppressedAlerts.map((entry) => entry.alert.code),
      };
    }

    const alertSection = notifyAlerts.map((entry) => formatAlertLine(entry.alert, entry.reason)).join('\n');

    await emailService.sendEmail({
      to: recipients,
      subject: `[KnowledgeAgent] Structured RAG Alerts (${notifyAlerts.length})`,
      text: `${report.markdown}\n\n## Notification Decision\n${alertSection}`,
    });

    for (const entry of notifyAlerts) {
      await systemLogRepository.create({
        level: entry.reason === 'severity_escalated' ? 'warn' : 'info',
        category: 'performance',
        event: 'structured-rag.alert.sent',
        message: `Structured RAG alert notification sent: ${entry.alert.code}`,
        source: 'structured-rag-alert',
        metadata: {
          code: entry.alert.code,
          severity: entry.alert.severity,
          reason: entry.reason,
          value: entry.alert.value,
          threshold: entry.alert.threshold,
        },
      });
    }

    systemLogger.performanceEvent(
      'structured-rag.alert.sent',
      'Structured RAG alert email sent',
      0,
      {
        alertsTriggered: report.summary.alerts.length,
        notifiedAlerts: notifyAlerts.map((entry) => entry.alert.code),
        suppressedAlerts: suppressedAlerts.map((entry) => entry.alert.code),
        recipients,
      }
    );

    return {
      alertsTriggered: report.summary.alerts.length,
      emailSent: true,
      recipients,
      notifiedAlertCodes: notifyAlerts.map((entry) => entry.alert.code),
      suppressedAlertCodes: suppressedAlerts.map((entry) => entry.alert.code),
    };
  },
};

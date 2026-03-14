import type { TFunction } from 'i18next';
import i18n from '@/i18n/i18n';

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getLocale(locale?: string): string {
  return locale ?? i18n.resolvedLanguage ?? i18n.language;
}

/** Full date — e.g. "2026年3月14日" / "March 14, 2026" */
export function formatDate(value: DateInput, locale?: string): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Date + time — e.g. "2026年3月14日 20:30" */
export function formatDateTime(value: DateInput, locale?: string): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(getLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Short date — e.g. "3月14日" / "Mar 14, 2026" */
export function formatDateShort(value: DateInput, locale?: string): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Time only — e.g. "20:30" */
export function formatTime(value: DateInput, locale?: string): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(getLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Relative time — e.g. "3小时前" / "Just now"
 *
 * Requires a `t` function bound to a namespace that contains
 * `time.justNow`, `time.minutesAgo`, `time.hoursAgo`,
 * `time.daysAgo`, `time.weeksAgo` keys.
 */
export function formatTimeAgo(value: DateInput, t: TFunction): string {
  const d = toDate(value);
  if (!d) return '';

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return t('time.justNow');
  if (seconds < 3600) return t('time.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('time.hoursAgo', { count: Math.floor(seconds / 3600) });
  if (seconds < 604800) return t('time.daysAgo', { count: Math.floor(seconds / 86400) });
  if (seconds < 2592000) return t('time.weeksAgo', { count: Math.floor(seconds / 604800) });

  return formatDateShort(d);
}

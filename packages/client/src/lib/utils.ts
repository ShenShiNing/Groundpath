import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from '@/i18n/i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `0 ${i18n.t('fileSize.units.bytes', { ns: 'common' })}`;
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    i18n.t('fileSize.units.bytes', { ns: 'common' }),
    i18n.t('fileSize.units.kb', { ns: 'common' }),
    i18n.t('fileSize.units.mb', { ns: 'common' }),
    i18n.t('fileSize.units.gb', { ns: 'common' }),
    i18n.t('fileSize.units.tb', { ns: 'common' }),
  ];

  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const formattedValue = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  const unit =
    i === 0 && formattedValue === 1 ? i18n.t('fileSize.units.byte', { ns: 'common' }) : sizes[i];

  return `${formattedValue} ${unit}`;
}

export function openInNewTab(url: string): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) {
    popup.opener = null;
  }

  return popup;
}

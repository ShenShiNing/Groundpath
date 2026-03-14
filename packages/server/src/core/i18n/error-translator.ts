import type { Request, Response } from 'express';
import type { ApiError } from '@knowledge-agent/shared/types';
import {
  ambiguousErrorCodes,
  renderCatalogMessage,
  type MessageTemplateValues,
  type ServerLocale,
} from './error-catalog';
import { translateLegacyErrorMessage } from './legacy-error-translator';

type TranslationContext = {
  code?: string;
  messageKey?: string;
  messageValues?: MessageTemplateValues;
};

type LocalizableApiError = ApiError & TranslationContext;

function extractHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function getRequest(target?: Request | Response): Request | undefined {
  if (!target) {
    return undefined;
  }

  if ('req' in target) {
    return target.req;
  }

  return target;
}

function hasChineseCharacters(message: string): boolean {
  return /[\u3400-\u9FFF]/.test(message);
}

function normalizeContext(
  context?: TranslationContext | string
): TranslationContext | undefined {
  if (!context) {
    return undefined;
  }

  if (typeof context === 'string') {
    return { code: context };
  }

  return context;
}

function resolveLocalizedMessage(
  message: string,
  locale: ServerLocale,
  context?: TranslationContext
): string {
  if (locale === 'en-US' || !message || hasChineseCharacters(message)) {
    return message;
  }

  if (context?.messageKey) {
    const localized = renderCatalogMessage(context.messageKey, locale, context.messageValues);
    if (localized) {
      return localized;
    }
  }

  if (context?.code && !ambiguousErrorCodes.has(context.code)) {
    const localized = renderCatalogMessage(context.code, locale, context.messageValues);
    if (localized) {
      return localized;
    }
  }

  const legacy = translateLegacyErrorMessage(message, locale);
  if (legacy) {
    return legacy;
  }

  if (context?.code) {
    const localized = renderCatalogMessage(context.code, locale, context.messageValues);
    if (localized) {
      return localized;
    }
  }

  return message;
}

export function resolveServerLocale(target?: Request | Response): ServerLocale {
  const req = getRequest(target);
  const customLanguage = extractHeaderValue(req?.headers['x-language']);
  const acceptLanguage = extractHeaderValue(req?.headers['accept-language']);
  const source = `${customLanguage},${acceptLanguage}`.toLowerCase();

  if (source.includes('zh')) {
    return 'zh-CN';
  }

  if (source.includes('en')) {
    return 'en-US';
  }

  return 'en-US';
}

export function translateErrorMessage(
  message: string,
  locale: ServerLocale,
  context?: TranslationContext | string
): string {
  return resolveLocalizedMessage(message, locale, normalizeContext(context));
}

export function translateErrorDetails<T>(details: T, locale: ServerLocale): T {
  if (locale === 'en-US' || details == null) {
    return details;
  }

  if (typeof details === 'string') {
    return translateErrorMessage(details, locale) as T;
  }

  if (Array.isArray(details)) {
    return details.map((item) => translateErrorDetails(item, locale)) as T;
  }

  if (typeof details === 'object') {
    return Object.fromEntries(
      Object.entries(details as Record<string, unknown>).map(([key, value]) => [
        key,
        translateErrorDetails(value, locale),
      ])
    ) as T;
  }

  return details;
}

export function localizeApiError(
  error: LocalizableApiError,
  target?: Request | Response
): ApiError {
  const locale = resolveServerLocale(target);

  return {
    code: error.code,
    message: resolveLocalizedMessage(error.message, locale, error),
    ...(error.details !== undefined ? { details: translateErrorDetails(error.details, locale) } : {}),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  };
}

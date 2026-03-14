import {
  AGENT_ERROR_CODES,
  ANNOTATION_ERROR_CODES,
  AUTH_ERROR_CODES,
  CHAT_ERROR_CODES,
  DOCUMENT_AI_ERROR_CODES,
  DOCUMENT_ERROR_CODES,
  EMAIL_ERROR_CODES,
  ERROR_CODES,
  KNOWLEDGE_BASE_ERROR_CODES,
  LLM_ERROR_CODES,
} from '@knowledge-agent/shared';
import { enUSErrorMessages, enUSLocalizedLabels } from './locales/en-US';
import { zhCNErrorMessages, zhCNLocalizedLabels } from './locales/zh-CN';

export type ServerLocale = 'zh-CN' | 'en-US';

export type MessageTemplateValue = string | number | boolean | null | undefined;
export type MessageTemplateValues = Record<string, MessageTemplateValue>;

type ErrorMessageKey = keyof typeof enUSErrorMessages;
type LocalizedLabelKey = keyof typeof enUSLocalizedLabels;

const LOCALIZED_VALUE_NAMES = new Set(['field', 'resource', 'subject']);

const generalErrorCodes = [
  'ACCESS_DENIED',
  'CONFLICT',
  'EXTERNAL_SERVICE_ERROR',
  'TIMEOUT',
  'REQUEST_ABORTED',
] as const;

const errorCodeGroups = [
  Object.values(ERROR_CODES),
  Object.values(AUTH_ERROR_CODES),
  Object.values(EMAIL_ERROR_CODES),
  Object.values(DOCUMENT_ERROR_CODES),
  Object.values(KNOWLEDGE_BASE_ERROR_CODES),
  Object.values(LLM_ERROR_CODES),
  Object.values(CHAT_ERROR_CODES),
  Object.values(DOCUMENT_AI_ERROR_CODES),
  Object.values(ANNOTATION_ERROR_CODES),
  Object.values(AGENT_ERROR_CODES),
  [...generalErrorCodes],
] as const;

export const knownServerErrorCodes = Array.from(
  new Set(errorCodeGroups.flatMap((group) => [...group]))
).sort();

export const ambiguousErrorCodes = new Set<string>([
  ERROR_CODES.VALIDATION_ERROR,
  ERROR_CODES.NOT_FOUND,
  AUTH_ERROR_CODES.TOKEN_EXPIRED,
  AUTH_ERROR_CODES.TOKEN_INVALID,
  AUTH_ERROR_CODES.TOKEN_REVOKED,
  AUTH_ERROR_CODES.MISSING_TOKEN,
  AUTH_ERROR_CODES.RATE_LIMITED,
  'EXTERNAL_SERVICE_ERROR',
  'TIMEOUT',
  'REQUEST_ABORTED',
]);

const errorMessageCatalogs = {
  'en-US': enUSErrorMessages,
  'zh-CN': zhCNErrorMessages,
} as const;

const localizedLabels = {
  'en-US': enUSLocalizedLabels,
  'zh-CN': zhCNLocalizedLabels,
} as const;

export function hasCatalogMessage(key: string): key is ErrorMessageKey {
  return key in enUSErrorMessages;
}

export function getCatalogMessage(key: string, locale: ServerLocale): string | undefined {
  if (!hasCatalogMessage(key)) {
    return undefined;
  }

  return errorMessageCatalogs[locale][key];
}

function normalizeLabelLookupKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasLocalizedLabelKey(key: string): key is LocalizedLabelKey {
  return key in enUSLocalizedLabels;
}

export function getLocalizedLabel(value: string, locale: ServerLocale): string {
  const normalized = normalizeLabelLookupKey(value);
  if (!hasLocalizedLabelKey(normalized)) {
    return value;
  }

  return localizedLabels[locale][normalized];
}

function normalizeTemplateValues(
  values: MessageTemplateValues | undefined,
  locale: ServerLocale
): MessageTemplateValues | undefined {
  if (!values) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      if (
        LOCALIZED_VALUE_NAMES.has(name) &&
        typeof value === 'string' &&
        value.trim().length > 0
      ) {
        return [name, getLocalizedLabel(value, locale)];
      }

      return [name, value];
    })
  );
}

export function renderTemplate(template: string, values?: MessageTemplateValues): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const value = values[name];
    return value == null ? '' : String(value);
  });
}

export function renderCatalogMessage(
  key: string,
  locale: ServerLocale,
  values?: MessageTemplateValues
): string | undefined {
  const template = getCatalogMessage(key, locale);
  if (!template) {
    return undefined;
  }

  return renderTemplate(template, normalizeTemplateValues(values, locale));
}

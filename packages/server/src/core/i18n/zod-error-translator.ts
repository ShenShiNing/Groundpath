import type { ZodError } from '@knowledge-agent/shared/schemas';
import { renderCatalogMessage, type MessageTemplateValues, type ServerLocale } from './error-catalog';
import { translateLegacyErrorMessage } from './legacy-error-translator';

type ZodIssue = ZodError['issues'][number];
type ZodIssueDescriptor = {
  key: string;
  values?: MessageTemplateValues;
};

function toTemplateValue(value: number | bigint): number | string {
  return typeof value === 'bigint' ? value.toString() : value;
}

function getLastPathSegment(path: readonly PropertyKey[]): string | undefined {
  const segment = [...path].reverse().find((item) => typeof item === 'string');
  return typeof segment === 'string' ? segment : undefined;
}

function getCustomDescriptor(issue: ZodIssue): ZodIssueDescriptor | undefined {
  if (issue.code !== 'custom') {
    return undefined;
  }

  const params = issue.params as Record<string, unknown> | undefined;
  const key = typeof params?.i18nKey === 'string' ? params.i18nKey : undefined;
  if (!key) {
    return undefined;
  }

  const values = Object.fromEntries(
    Object.entries(params ?? {}).filter(([name]) => name !== 'i18nKey')
  ) as MessageTemplateValues;

  return {
    key,
    values: Object.keys(values).length > 0 ? values : undefined,
  };
}

function buildDescriptor(issue: ZodIssue): ZodIssueDescriptor | undefined {
  const field = getLastPathSegment(issue.path);
  const fieldValues = field ? { field } : undefined;
  const customDescriptor = getCustomDescriptor(issue);

  if (customDescriptor) {
    return customDescriptor;
  }

  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input == null && field) {
        return { key: 'FIELD_REQUIRED', values: { field } };
      }

      return fieldValues ? { key: 'FIELD_INVALID_TYPE', values: fieldValues } : undefined;
    }
    case 'invalid_value':
      return fieldValues ? { key: 'FIELD_INVALID_OPTION', values: fieldValues } : undefined;
    case 'invalid_format': {
      switch (issue.format) {
        case 'email':
          return { key: 'FIELD_INVALID_EMAIL' };
        case 'url':
          return { key: 'FIELD_INVALID_URL' };
        case 'uuid':
          return fieldValues ? { key: 'FIELD_INVALID_UUID', values: fieldValues } : undefined;
        case 'regex': {
          const pattern = issue.pattern ?? '';
          if (field === 'username') {
            return { key: 'USERNAME_CHARACTERS_ONLY' };
          }
          if (field === 'password' || field === 'newPassword') {
            if (pattern.includes('[a-zA-Z]')) {
              return { key: 'PASSWORD_LETTER_REQUIRED' };
            }
            if (pattern.includes('[0-9]')) {
              return { key: 'PASSWORD_NUMBER_REQUIRED' };
            }
          }
          if (field === 'code' && pattern.includes('\\d{6}')) {
            return { key: 'VERIFICATION_CODE_DIGITS' };
          }

          return fieldValues ? { key: 'FIELD_INVALID_STRING_FORMAT', values: fieldValues } : undefined;
        }
        default:
          return fieldValues ? { key: 'FIELD_INVALID_STRING_FORMAT', values: fieldValues } : undefined;
      }
    }
    case 'too_small': {
      if (issue.origin === 'string') {
        if (issue.exact) {
          return fieldValues
            ? {
                key: 'FIELD_EXACT_LENGTH',
                values: { ...fieldValues, length: toTemplateValue(issue.minimum) },
              }
            : undefined;
        }
        if (issue.minimum === 1 && field) {
          return { key: 'FIELD_REQUIRED', values: { field } };
        }
        return fieldValues
          ? {
              key: 'FIELD_MIN_LENGTH',
              values: { ...fieldValues, min: toTemplateValue(issue.minimum) },
            }
          : undefined;
      }

      if (issue.origin === 'array' || issue.origin === 'set') {
        return fieldValues
          ? {
              key: 'FIELD_MIN_ITEMS',
              values: { ...fieldValues, min: toTemplateValue(issue.minimum) },
            }
          : undefined;
      }

      return fieldValues
        ? {
            key: 'FIELD_MIN_VALUE',
            values: { ...fieldValues, min: toTemplateValue(issue.minimum) },
          }
        : undefined;
    }
    case 'too_big': {
      if (issue.origin === 'string') {
        if (issue.exact) {
          return fieldValues
            ? {
                key: 'FIELD_EXACT_LENGTH',
                values: { ...fieldValues, length: toTemplateValue(issue.maximum) },
              }
            : undefined;
        }
        return fieldValues
          ? {
              key: 'FIELD_MAX_LENGTH',
              values: { ...fieldValues, max: toTemplateValue(issue.maximum) },
            }
          : undefined;
      }

      if (issue.origin === 'array' || issue.origin === 'set') {
        return fieldValues
          ? {
              key: 'FIELD_MAX_ITEMS',
              values: { ...fieldValues, max: toTemplateValue(issue.maximum) },
            }
          : undefined;
      }

      return fieldValues
        ? {
            key: 'FIELD_MAX_VALUE',
            values: { ...fieldValues, max: toTemplateValue(issue.maximum) },
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

export function translateZodIssue(issue: ZodIssue, locale: ServerLocale): string {
  if (locale === 'en-US') {
    return issue.message;
  }

  const descriptor = buildDescriptor(issue);
  if (descriptor) {
    const localized = renderCatalogMessage(descriptor.key, locale, descriptor.values);
    if (localized) {
      return localized;
    }
  }

  return translateLegacyErrorMessage(issue.message, locale) ?? issue.message;
}

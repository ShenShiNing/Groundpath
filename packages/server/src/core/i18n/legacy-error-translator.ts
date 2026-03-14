import {
  renderCatalogMessage,
  type MessageTemplateValues,
  type ServerLocale,
} from './error-catalog';

const exactLegacyMessageKeys = {
  'Validation failed': 'VALIDATION_ERROR',
  'Invalid request origin': 'INVALID_REQUEST_ORIGIN',
  'CSRF token required': 'CSRF_TOKEN_REQUIRED',
  'CSRF token mismatch': 'CSRF_TOKEN_MISMATCH',
  'Authorization token required': 'AUTHORIZATION_TOKEN_REQUIRED',
  'User not authenticated': 'USER_NOT_AUTHENTICATED',
  'Current password is incorrect': 'INVALID_PASSWORD',
  'New password must be different from current password': 'NEW_PASSWORD_MUST_DIFFER',
  'New email must be different from the current email': 'NEW_EMAIL_MUST_DIFFER',
  'Passwords do not match': 'PASSWORDS_DO_NOT_MATCH',
  'Verification code must be 6 digits': 'VERIFICATION_CODE_DIGITS',
  'No file uploaded': 'NO_FILE_UPLOADED',
  'Message not found': 'MESSAGE_NOT_FOUND',
  'Only user messages can be edited': 'MESSAGE_EDIT_FORBIDDEN',
  'Document text is too large to chunk safely': 'DOCUMENT_TEXT_TOO_LARGE_TO_CHUNK',
  'Invalid environment variables': 'INVALID_ENVIRONMENT_VARIABLES',
  'No response body': 'NO_RESPONSE_BODY',
  'No content returned from storage': 'NO_STORAGE_CONTENT',
  'Invalid encrypted format': 'INVALID_ENCRYPTED_FORMAT',
  'Rate limiter unavailable': 'RATE_LIMITER_UNAVAILABLE',
  'Authentication rate limiter unavailable': 'AUTH_RATE_LIMITER_UNAVAILABLE',
  'Invalid Redis rate limiter response': 'INVALID_RATE_LIMITER_RESPONSE',
  'Invalid or expired signature': 'INVALID_SIGNATURE',
  'API key is required for custom provider': 'CUSTOM_PROVIDER_API_KEY_REQUIRED',
  'Base URL is required for custom provider': 'CUSTOM_PROVIDER_BASE_URL_REQUIRED',
  'OpenAI API key is required': 'OPENAI_API_KEY_REQUIRED',
  'Anthropic API key is required': 'ANTHROPIC_API_KEY_REQUIRED',
  'Zhipu API key is required': 'ZHIPU_API_KEY_REQUIRED',
  'DeepSeek API key is required': 'DEEPSEEK_API_KEY_REQUIRED',
  'VLM API key not configured. Set VLM_API_KEY in your environment.': 'VLM_API_KEY_REQUIRED',
} as const;

function renderLegacyKey(
  key: keyof typeof exactLegacyMessageKeys | string,
  locale: ServerLocale,
  values?: MessageTemplateValues
): string | undefined {
  return renderCatalogMessage(String(key), locale, values);
}

type PatternResolver = (matches: RegExpMatchArray, locale: ServerLocale) => string | undefined;

const legacyPatterns: Array<[RegExp, PatternResolver]> = [
  [
    /^(.+) not found$/i,
    (matches, locale) => renderLegacyKey('RESOURCE_NOT_FOUND', locale, { resource: matches[1] }),
  ],
  [
    /^Valid (.+) is required$/i,
    (matches, locale) => renderLegacyKey('VALID_FIELD_REQUIRED', locale, { field: matches[1] }),
  ],
  [
    /^(.+) is required$/i,
    (matches, locale) => renderLegacyKey('FIELD_REQUIRED', locale, { field: matches[1] }),
  ],
  [
    /^(.+) required$/i,
    (matches, locale) => renderLegacyKey('FIELD_REQUIRED', locale, { field: matches[1] }),
  ],
  [
    /^Invalid (.+)$/i,
    (matches, locale) => renderLegacyKey('FIELD_INVALID', locale, { field: matches[1] }),
  ],
  [
    /^(.+) has expired$/i,
    (matches, locale) => renderLegacyKey('FIELD_EXPIRED', locale, { field: matches[1] }),
  ],
  [
    /^(.+) has been revoked$/i,
    (matches, locale) => renderLegacyKey('FIELD_REVOKED', locale, { field: matches[1] }),
  ],
  [
    /^(.+) mismatch$/i,
    (matches, locale) => renderLegacyKey('FIELD_MISMATCH', locale, { field: matches[1] }),
  ],
  [
    /^Too many (.+) attempts, please try again later$/i,
    (matches, locale) =>
      renderLegacyKey('TOO_MANY_SUBJECT_ATTEMPTS', locale, { subject: `${matches[1]} attempts` }),
  ],
  [
    /^Too many (.+), please try again later$/i,
    (matches, locale) => renderLegacyKey('TOO_MANY_SUBJECT_ATTEMPTS', locale, { subject: matches[1] }),
  ],
  [
    /^Please wait (\d+) seconds before requesting another code$/i,
    (matches, locale) => renderLegacyKey('WAIT_BEFORE_RETRYING_CODE', locale, { seconds: matches[1] }),
  ],
  [
    /^(.+?) API error \((\d+)\): (.+)$/i,
    (matches, locale) =>
      renderLegacyKey('API_ERROR_WITH_STATUS', locale, {
        provider: matches[1],
        status: matches[2],
        detail: matches[3],
      }),
  ],
  [
    /^(.+?) API error: (.+)$/i,
    (matches, locale) =>
      renderLegacyKey('API_ERROR', locale, {
        provider: matches[1],
        detail: matches[2],
      }),
  ],
  [
    /^(.+?) API request timed out after (.+)$/i,
    (matches, locale) =>
      renderLegacyKey('API_TIMEOUT', locale, {
        provider: matches[1],
        duration: matches[2],
      }),
  ],
  [
    /^Avatar file too large\. Maximum size is (\d+)MB$/i,
    (matches, locale) => renderLegacyKey('AVATAR_FILE_TOO_LARGE', locale, { size: matches[1] }),
  ],
  [
    /^Unknown (.+): (.+)$/i,
    (matches, locale) =>
      renderLegacyKey('UNKNOWN_SUBJECT', locale, {
        subject: matches[1],
        value: matches[2],
      }),
  ],
];

export function translateLegacyErrorMessage(
  message: string,
  locale: ServerLocale
): string | undefined {
  if (locale === 'en-US' || !message) {
    return undefined;
  }

  const exactKey = exactLegacyMessageKeys[message as keyof typeof exactLegacyMessageKeys];
  if (exactKey) {
    return renderLegacyKey(exactKey, locale);
  }

  for (const [pattern, resolver] of legacyPatterns) {
    const matches = message.match(pattern);
    if (matches) {
      return resolver(matches, locale);
    }
  }

  return undefined;
}

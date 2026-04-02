import { isAxiosError } from 'axios';

export type ClientLogMetadata = Record<string, unknown>;

const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_REFERENCE_VALUE = '[Circular]';
const SENSITIVE_LOG_KEY_PATTERN =
  /(email|password|passcode|secret|token|authorization|cookie|api[_-]?key)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeUrlPath(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

function getApiErrorCode(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const error = data.error;
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

function sanitizeLogValue(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && SENSITIVE_LOG_KEY_PATTERN.test(key)) {
    return REDACTED_VALUE;
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeErrorForLogging(value);
  }

  if (seen.has(value)) {
    return CIRCULAR_REFERENCE_VALUE;
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeLogValue(item, undefined, seen));
    }

    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeLogValue(nestedValue, nestedKey, seen),
      ])
    );
  } finally {
    seen.delete(value);
  }
}

function serializeErrorForLogging(error: unknown): unknown {
  if (isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      method:
        typeof error.config?.method === 'string' ? error.config.method.toUpperCase() : undefined,
      url: sanitizeUrlPath(error.config?.url),
      apiErrorCode: getApiErrorCode(error.response?.data),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return sanitizeLogValue(error);
}

export function logClientError(scope: string, error: unknown, metadata?: ClientLogMetadata): void {
  const safeError = serializeErrorForLogging(error);
  const safeMetadata = metadata ? sanitizeLogValue(metadata) : undefined;

  if (safeMetadata) {
    console.error(`[${scope}]`, safeError, safeMetadata);
    return;
  }

  console.error(`[${scope}]`, safeError);
}

export function logClientWarning(
  scope: string,
  message: string,
  metadata?: ClientLogMetadata
): void {
  const safeMetadata = metadata ? sanitizeLogValue(metadata) : undefined;

  if (safeMetadata) {
    console.warn(`[${scope}] ${message}`, safeMetadata);
    return;
  }

  console.warn(`[${scope}] ${message}`);
}

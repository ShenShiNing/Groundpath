import { createHmac } from 'crypto';
import * as envConfig from '@config/env';
import { normalizeIpAddress } from '@core/utils/request.utils';

const SECRET_KEYS = new Set([
  'password',
  'oldpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'apikey',
  'apisecret',
  'secret',
  'secretkey',
  'state',
]);

const EMAIL_KEYS = new Set(['email']);
const IP_KEYS = new Set(['ip', 'ipaddress']);
const USER_AGENT_KEYS = new Set(['useragent']);
const URL_KEYS = new Set(['url']);
const TEXT_SUMMARY_KEYS = new Set(['query', 'response', 'prompt', 'body', 'content']);
const HEADER_KEYS = new Set(['headers']);

export interface TextLogSummary {
  length: number;
  fingerprint: string;
}

type ErrorLike = {
  cause?: unknown;
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  name?: string;
  response?: { status?: unknown };
  stack?: string;
  status?: unknown;
  statusCode?: unknown;
};

export function fingerprintLogValue(value: string): string {
  return createHmac('sha256', resolveFingerprintSalt())
    .update(value)
    .digest('hex')
    .slice(0, resolveFingerprintLength());
}

export function describeTextForLog(value: string | null | undefined): TextLogSummary | null {
  if (typeof value !== 'string') {
    return null;
  }

  return {
    length: value.length,
    fingerprint: fingerprintLogValue(value),
  };
}

export function maskEmailForLog(email: string | null | undefined): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const [localPart = '', domain = ''] = normalized.split('@');
  if (!domain) {
    return `${maskFragment(localPart, 2)}@***`;
  }

  const domainSegments = domain.split('.');
  const domainName = domainSegments.shift() ?? '';
  const domainSuffix = domainSegments.length > 0 ? `.${domainSegments.join('.')}` : '';

  return `${maskFragment(localPart, 2)}@${maskFragment(domainName, 2)}${domainSuffix}`;
}

export function fingerprintIpAddress(ipAddress: string | null | undefined): string | null {
  const normalizedIp = normalizeIpAddress(ipAddress);
  if (!normalizedIp) {
    return null;
  }

  return `ip_${fingerprintLogValue(normalizedIp)}`;
}

export function sanitizeRequestPath(url: string | null | undefined): string {
  if (!url) {
    return '/';
  }

  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.pathname || '/';
  } catch {
    const pathname = url.split('?')[0]?.split('#')[0];
    return pathname && pathname.length > 0 ? pathname : '/';
  }
}

export function summarizeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(isDevelopmentEnv() && error.stack ? { stack: error.stack } : {}),
      ...extractErrorShape(error),
    };
  }

  if (error && typeof error === 'object') {
    return {
      ...extractErrorShape(error as ErrorLike),
      value: Object.prototype.toString.call(error),
    };
  }

  return { value: String(error) };
}

export function sanitizeLogMetadata(metadata: unknown): unknown {
  return sanitizeUnknownValue(metadata);
}

function sanitizeUnknownValue(value: unknown, key?: string): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeStringField(value, key);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknownValue(item));
  }

  if (value instanceof Error) {
    return summarizeErrorForLog(value);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = sanitizeUnknownValue(childValue, childKey);
    }

    return result;
  }

  return value;
}

function sanitizeStringField(value: string, key?: string): unknown {
  const normalizedKey = key?.toLowerCase();

  if (normalizedKey && SECRET_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  if (normalizedKey && EMAIL_KEYS.has(normalizedKey)) {
    return maskEmailForLog(value);
  }

  if (normalizedKey && IP_KEYS.has(normalizedKey)) {
    return fingerprintIpAddress(value);
  }

  if (normalizedKey && USER_AGENT_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  if (normalizedKey && URL_KEYS.has(normalizedKey)) {
    return sanitizeRequestPath(value);
  }

  if (normalizedKey && TEXT_SUMMARY_KEYS.has(normalizedKey)) {
    return describeTextForLog(value);
  }

  if (normalizedKey && HEADER_KEYS.has(normalizedKey)) {
    return '[REDACTED]';
  }

  return value;
}

function maskFragment(fragment: string, keepLength: number): string {
  if (!fragment) {
    return '***';
  }

  const safeKeepLength = Math.max(1, Math.min(keepLength, fragment.length));
  return `${fragment.slice(0, safeKeepLength)}***`;
}

function extractErrorShape(error: ErrorLike): Record<string, unknown> {
  const code = typeof error.code === 'string' ? error.code : undefined;
  const statusCode = extractNumericStatus(error);

  return {
    ...(code ? { code } : {}),
    ...(statusCode !== undefined ? { statusCode } : {}),
  };
}

function extractNumericStatus(error: ErrorLike, depth = 0): number | undefined {
  if (!error || depth > 3) {
    return undefined;
  }

  if (typeof error.statusCode === 'number') return error.statusCode;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.response?.status === 'number') return error.response.status;

  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    return extractNumericStatus(cause as ErrorLike, depth + 1);
  }

  return undefined;
}

function resolveFingerprintSalt(): string {
  const loggingConfig =
    'loggingConfig' in envConfig
      ? (envConfig as { loggingConfig?: { redaction?: { fingerprintSalt?: string } } })
          .loggingConfig
      : undefined;

  return (
    loggingConfig?.redaction?.fingerprintSalt ??
    process.env.LOG_REDACTION_SALT ??
    process.env.ENCRYPTION_KEY ??
    'log-redaction-fallback-salt'
  );
}

function resolveFingerprintLength(): number {
  const loggingConfig =
    'loggingConfig' in envConfig
      ? (envConfig as { loggingConfig?: { redaction?: { fingerprintLength?: number } } })
          .loggingConfig
      : undefined;

  return loggingConfig?.redaction?.fingerprintLength ?? 12;
}

function isDevelopmentEnv(): boolean {
  const serverConfig =
    'serverConfig' in envConfig
      ? (envConfig as { serverConfig?: { nodeEnv?: string } }).serverConfig
      : undefined;

  return (serverConfig?.nodeEnv ?? process.env.NODE_ENV) === 'development';
}

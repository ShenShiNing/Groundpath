import { isIP } from 'node:net';
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

export function maskIpAddressForLog(ipAddress: string | null | undefined): string | null {
  const normalizedIp = normalizeIpAddress(ipAddress);
  if (!normalizedIp) {
    return null;
  }

  const ipVersion = isIP(normalizedIp);
  if (ipVersion === 4) {
    return maskIpv4Address(normalizedIp);
  }

  if (ipVersion === 6) {
    return maskIpv6Address(normalizedIp);
  }

  return null;
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

  if (value instanceof Date) {
    return value;
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

function maskIpv4Address(ipAddress: string): string {
  const [first = '*', second = '*', third = '*'] = ipAddress.split('.');
  return `${first}.${second}.${third}.*`;
}

function maskIpv6Address(ipAddress: string): string {
  const expandedSegments = expandIpv6Address(ipAddress);
  if (!expandedSegments) {
    return 'ipv6:*';
  }

  return `${expandedSegments.slice(0, 3).join(':')}:*`;
}

function expandIpv6Address(ipAddress: string): string[] | null {
  const lowerCaseIp = ipAddress.toLowerCase();

  if (lowerCaseIp.indexOf('::') !== lowerCaseIp.lastIndexOf('::')) {
    return null;
  }

  const hasCompression = lowerCaseIp.includes('::');
  const [head = '', tail = ''] = lowerCaseIp.split('::');
  const headSegments = parseIpv6Section(head);
  const tailSegments = parseIpv6Section(tail);

  if (!headSegments || !tailSegments) {
    return null;
  }

  if (!hasCompression) {
    return headSegments.length === 8
      ? headSegments.map((segment) => segment.padStart(4, '0'))
      : null;
  }

  const missingSegmentCount = 8 - headSegments.length - tailSegments.length;
  if (missingSegmentCount < 1) {
    return null;
  }

  return [
    ...headSegments,
    ...Array.from({ length: missingSegmentCount }, () => '0'),
    ...tailSegments,
  ].map((segment) => segment.padStart(4, '0'));
}

function parseIpv6Section(section: string): string[] | null {
  if (!section) {
    return [];
  }

  const parsedSegments: string[] = [];

  for (const rawSegment of section.split(':')) {
    if (!rawSegment) {
      return null;
    }

    if (rawSegment.includes('.')) {
      const embeddedIpv4Segments = parseEmbeddedIpv4(rawSegment);
      if (!embeddedIpv4Segments) {
        return null;
      }

      parsedSegments.push(...embeddedIpv4Segments);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(rawSegment)) {
      return null;
    }

    parsedSegments.push(rawSegment);
  }

  return parsedSegments;
}

function parseEmbeddedIpv4(ipAddress: string): string[] | null {
  if (isIP(ipAddress) !== 4) {
    return null;
  }

  const octets = ipAddress.split('.').map((segment) => Number(segment));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return null;
  }

  const first = octets[0]!;
  const second = octets[1]!;
  const third = octets[2]!;
  const fourth = octets[3]!;

  return [((first << 8) | second).toString(16), ((third << 8) | fourth).toString(16)];
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

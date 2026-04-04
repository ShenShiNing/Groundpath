import { isIP } from 'node:net';
import type { Request } from 'express';
import { AppError } from '@core/errors/app-error';

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^::1$/i,
  /^fe80:/i,
  /^fc00:/i,
  /^fd/i,
] as const;

/**
 * Normalize email address for consistent storage and lookup.
 * Applies lowercase and trim to ensure case-insensitive matching.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizeIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) {
    return null;
  }

  let normalized = ipAddress.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes(',')) {
    normalized = normalized.split(',')[0]?.trim() ?? '';
  }

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('[')) {
    const closingIndex = normalized.indexOf(']');
    if (closingIndex > 0) {
      normalized = normalized.slice(1, closingIndex);
    }
  } else {
    const ipv4WithPortMatch = normalized.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    const ipv4Address = ipv4WithPortMatch?.[1];
    if (ipv4Address) {
      normalized = ipv4Address;
    }
  }

  const zoneIndex = normalized.indexOf('%');
  if (zoneIndex !== -1) {
    normalized = normalized.slice(0, zoneIndex);
  }

  if (normalized.toLowerCase().startsWith('::ffff:')) {
    normalized = normalized.slice('::ffff:'.length);
  }

  return normalized || null;
}

function normalizeValidIpAddress(ipAddress: string | null | undefined): string | null {
  const normalized = normalizeIpAddress(ipAddress);
  if (!normalized || isIP(normalized) === 0) {
    return null;
  }
  return normalized;
}

export function isPrivateIpAddress(ipAddress: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ipAddress));
}

function isTrustProxyEnabled(req: Request): boolean {
  return typeof req.app?.get === 'function' && Boolean(req.app.get('trust proxy'));
}

function getHeaderValue(req: Request, headerName: string): string | string[] | undefined {
  return req.headers?.[headerName.toLowerCase()];
}

function getFirstPublicIpAddress(ipAddresses: string[]): string | null {
  return ipAddresses.find((ipAddress) => !isPrivateIpAddress(ipAddress)) ?? null;
}

function getBestIpAddress(ipAddresses: string[]): string | null {
  return getFirstPublicIpAddress(ipAddresses) ?? ipAddresses[0] ?? null;
}

function extractIpCandidatesFromHeaderValue(headerValue: string | string[] | undefined): string[] {
  if (!headerValue) {
    return [];
  }

  const headerValues = Array.isArray(headerValue) ? headerValue : [headerValue];
  return headerValues
    .flatMap((value) => value.split(','))
    .map((value) => normalizeValidIpAddress(value))
    .filter((value): value is string => value !== null);
}

function extractForwardedHeaderIpCandidates(headerValue: string | string[] | undefined): string[] {
  if (!headerValue) {
    return [];
  }

  const headerValues = Array.isArray(headerValue) ? headerValue : [headerValue];

  return headerValues
    .flatMap((value) => value.split(','))
    .map((entry) =>
      entry
        .split(';')
        .map((segment) => segment.trim())
        .find((segment) => segment.toLowerCase().startsWith('for='))
    )
    .map((segment) => {
      if (!segment) {
        return null;
      }

      const rawValue = segment
        .slice(4)
        .trim()
        .replace(/^"+|"+$/g, '');
      return normalizeValidIpAddress(rawValue);
    })
    .filter((value): value is string => value !== null);
}

function getTrustedProxyClientIp(req: Request): string | null {
  const trustedClientHeaders = [
    getHeaderValue(req, 'cf-connecting-ip'),
    getHeaderValue(req, 'true-client-ip'),
    getHeaderValue(req, 'x-client-ip'),
  ];
  const trustedClientIps = trustedClientHeaders
    .map((headerValue) =>
      normalizeValidIpAddress(Array.isArray(headerValue) ? headerValue[0] : headerValue)
    )
    .filter((value): value is string => value !== null);
  const trustedClientIp = getBestIpAddress(trustedClientIps);
  if (trustedClientIp) {
    return trustedClientIp;
  }

  const forwardedChainIps = [
    ...extractIpCandidatesFromHeaderValue(getHeaderValue(req, 'x-original-forwarded-for')),
    ...extractIpCandidatesFromHeaderValue(getHeaderValue(req, 'x-forwarded-for')),
    ...extractForwardedHeaderIpCandidates(getHeaderValue(req, 'forwarded')),
  ];
  const forwardedChainIp = getBestIpAddress(forwardedChainIps);
  if (forwardedChainIp) {
    return forwardedChainIp;
  }

  const realIpHeader = getHeaderValue(req, 'x-real-ip');
  return normalizeValidIpAddress(Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader);
}

/**
 * Extract client IP address from request.
 *
 * Uses Express's built-in `req.ip` which respects the `trust proxy` setting.
 * When trust proxy is configured, Express will correctly parse X-Forwarded-For.
 * When not configured, it falls back to the direct connection IP.
 *
 * IMPORTANT: Set TRUST_PROXY env var when behind a reverse proxy (nginx, cloudflare, etc.)
 * to ensure correct IP detection. Without it, X-Forwarded-For is ignored for security.
 *
 * @see https://expressjs.com/en/guide/behind-proxies.html
 */
export function getClientIp(req: Request): string | null {
  const requestIp = normalizeValidIpAddress(req.ip ?? null);
  if (requestIp && !isPrivateIpAddress(requestIp)) {
    return requestIp;
  }

  if (isTrustProxyEnabled(req)) {
    const trustedProxyIp = getTrustedProxyClientIp(req);
    if (trustedProxyIp) {
      return trustedProxyIp;
    }
  }

  return requestIp ?? normalizeValidIpAddress(req.socket.remoteAddress ?? null);
}

/**
 * Extract authenticated user ID from request.
 * Throws AppError if not authenticated.
 */
export function requireUserId(req: Request): string {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
  }
  return userId;
}

/**
 * Get string param from request params (handles Express 5 string | string[] type).
 */
export function getParamId(req: Request, paramName: string): string | undefined {
  const value = req.params[paramName];
  return Array.isArray(value) ? value[0] : value;
}

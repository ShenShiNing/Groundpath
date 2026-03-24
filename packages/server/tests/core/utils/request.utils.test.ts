import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { getClientIp, normalizeIpAddress } from '@core/utils';

function createRequest(input: {
  ip?: string | null;
  remoteAddress?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  trustProxy?: boolean;
}): Request {
  return {
    ip: input.ip ?? undefined,
    headers: input.headers ?? {},
    app: {
      get: (key: string) => (key === 'trust proxy' ? (input.trustProxy ?? false) : undefined),
    },
    socket: {
      remoteAddress: input.remoteAddress ?? undefined,
    },
  } as Request;
}

describe('request.utils', () => {
  it('normalizes ipv4-mapped addresses and strips ports', () => {
    expect(normalizeIpAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIpAddress('203.0.113.9:443')).toBe('203.0.113.9');
  });

  it('prefers forwarded client ip when the direct ip is a private proxy hop', () => {
    const req = createRequest({
      ip: '10.0.0.8',
      trustProxy: true,
      headers: {
        'x-forwarded-for': '203.0.113.20, 10.0.0.8',
      },
    });

    expect(getClientIp(req)).toBe('203.0.113.20');
  });

  it('keeps the direct request ip when it is already public', () => {
    const req = createRequest({
      ip: '203.0.113.30',
      trustProxy: true,
      headers: {
        'x-forwarded-for': '198.51.100.10',
      },
    });

    expect(getClientIp(req)).toBe('203.0.113.30');
  });
});

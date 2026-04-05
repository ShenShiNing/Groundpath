import { describe, expect, it } from 'vitest';
import { maskIpAddressForLog, sanitizeLogMetadata } from '@core/logger/redaction';

describe('logger redaction helpers', () => {
  it('masks ipv4 addresses by keeping the first three octets', () => {
    expect(maskIpAddressForLog('203.0.113.42')).toBe('203.0.113.*');
    expect(maskIpAddressForLog('203.0.113.42:443')).toBe('203.0.113.*');
    expect(maskIpAddressForLog('203.0.113.42, 10.0.0.8')).toBe('203.0.113.*');
  });

  it('masks ipv6 addresses by keeping the first three groups', () => {
    expect(maskIpAddressForLog('2001:db8::8a2e:370:7334')).toBe('2001:0db8:0000:*');
  });

  it('sanitizes nested ip fields without leaking raw values', () => {
    const metadata = sanitizeLogMetadata({
      ip: '203.0.113.42',
      nested: {
        ipAddress: '[2001:db8::1]:443',
      },
    });

    expect(metadata).toEqual({
      ip: '203.0.113.*',
      nested: {
        ipAddress: '2001:0db8:0000:*',
      },
    });
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.42');
    expect(JSON.stringify(metadata)).not.toContain('2001:db8::1');
  });
});

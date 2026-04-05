import { describe, expect, it } from 'vitest';
import {
  describeTextForLog,
  fingerprintIpAddress,
  maskEmailForLog,
  sanitizeRequestPath,
} from '@core/logger/redaction';
import { LOGGER_REDACT_PATHS } from '@core/logger';

describe('logger redaction helpers', () => {
  it('sanitizes request paths by stripping query strings and fragments', () => {
    expect(
      sanitizeRequestPath('/api/v1/auth/oauth/github/callback?code=secret&state=opaque#done')
    ).toBe('/api/v1/auth/oauth/github/callback');
  });

  it('masks emails for logs', () => {
    expect(maskEmailForLog('Alice.Example@Example.com')).toBe('al***@ex***.com');
  });

  it('fingerprints ip addresses without keeping the raw value', () => {
    const fingerprint = fingerprintIpAddress('203.0.113.42');

    expect(fingerprint).toMatch(/^ip_[a-f0-9]{12}$/);
    expect(fingerprint).not.toContain('203.0.113.42');
  });

  it('summarizes text without returning raw content', () => {
    expect(describeTextForLog('hello world')).toEqual({
      length: 11,
      fingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
  });

  it('keeps defense-in-depth redact paths for common raw pii fields', () => {
    expect(LOGGER_REDACT_PATHS).toEqual(
      expect.arrayContaining(['*.email', '*.ipAddress', '*.userAgent', '*.query', '*.response'])
    );
  });
});

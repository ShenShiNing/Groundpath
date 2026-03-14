import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { localizeApiError, resolveServerLocale } from '@core/i18n/error-translator';

function createMockRequest(headers: Record<string, string> = {}) {
  return {
    headers,
  } as unknown as Request;
}

describe('error-translator', () => {
  it('should default to en-US when no locale header is present', () => {
    expect(resolveServerLocale(createMockRequest())).toBe('en-US');
  });

  it('should prefer x-language over accept-language', () => {
    const request = createMockRequest({
      'x-language': 'zh-CN',
      'accept-language': 'en-US,en;q=0.9',
    });

    expect(resolveServerLocale(request)).toBe('zh-CN');
  });

  it('should translate exact error messages into zh-CN', () => {
    const request = createMockRequest({ 'x-language': 'zh-CN' });

    const localized = localizeApiError(
      {
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect',
      },
      request
    );

    expect(localized.message).toBe('当前密码不正确');
  });

  it('should translate pattern-based messages into zh-CN', () => {
    const request = createMockRequest({ 'x-language': 'zh-CN' });

    const localized = localizeApiError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Document ID is required',
      },
      request
    );

    expect(localized.message).toBe('必须提供文档 ID');
  });

  it('should translate validation details recursively', () => {
    const request = createMockRequest({ 'x-language': 'zh-CN' });

    const localized = localizeApiError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          email: ['Invalid email format'],
          password: ['Password must be at least 8 characters'],
        },
      },
      request
    );

    expect(localized.message).toBe('请求参数校验失败');
    expect(localized.details).toEqual({
      email: ['邮箱格式不正确'],
      password: ['密码至少需要 8 位'],
    });
  });
});

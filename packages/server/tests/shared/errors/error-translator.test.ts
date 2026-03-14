import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { changePasswordRequestSchema } from '@knowledge-agent/shared/schemas';
import {
  getCatalogMessage,
  knownServerErrorCodes,
} from '@core/i18n/error-catalog';
import { localizeApiError, resolveServerLocale } from '@core/i18n/error-translator';
import { enUSErrorMessages } from '@core/i18n/locales/en-US';
import { zhCNErrorMessages } from '@core/i18n/locales/zh-CN';
import { translateZodIssue } from '@core/i18n/zod-error-translator';

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

  it('should translate stable error codes into zh-CN even when the english message changes', () => {
    const request = createMockRequest({ 'x-language': 'zh-CN' });

    const localized = localizeApiError(
      {
        code: 'INVALID_PASSWORD',
        message: 'The current password is incorrect',
      },
      request
    );

    expect(localized.message).toBe('当前密码不正确');
  });

  it('should translate explicit message keys with localized template values', () => {
    const request = createMockRequest({ 'x-language': 'zh-CN' });

    const localized = localizeApiError(
      {
        code: 'NOT_FOUND',
        message: 'Knowledge base not found',
        messageKey: 'RESOURCE_NOT_FOUND',
        messageValues: { resource: 'knowledge base' },
      },
      request
    );

    expect(localized.message).toBe('知识库不存在');
  });

  it('should keep legacy validation messages working while code-based migration is in progress', () => {
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

  it('should translate zod issues using issue metadata and custom i18n params', () => {
    const result = changePasswordRequestSchema.safeParse({
      oldPassword: '',
      newPassword: 'abcdefgh',
      confirmPassword: 'ijklmnop',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const translated = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: translateZodIssue(issue, 'zh-CN'),
    }));

    expect(translated).toContainEqual({
      path: 'oldPassword',
      code: 'too_small',
      message: '必须提供当前密码',
    });
    expect(translated).toContainEqual({
      path: 'newPassword',
      code: 'invalid_format',
      message: '密码必须至少包含一个数字',
    });
    expect(translated).toContainEqual({
      path: 'confirmPassword',
      code: 'custom',
      message: '两次输入的密码不一致',
    });
  });

  it('should keep locale resource keys aligned', () => {
    expect(Object.keys(zhCNErrorMessages).sort()).toEqual(Object.keys(enUSErrorMessages).sort());
  });

  it('should provide translations for all known server error codes', () => {
    const missing = knownServerErrorCodes.filter(
      (code) => !getCatalogMessage(code, 'en-US') || !getCatalogMessage(code, 'zh-CN')
    );

    expect(missing).toEqual([]);
  });
});

import type { Request, Response } from 'express';
import type { ApiError } from '@knowledge-agent/shared/types';

export type ServerLocale = 'zh-CN' | 'en-US';

const EXACT_ZH_MESSAGES: Record<string, string> = {
  'Validation failed': '请求参数校验失败',
  'Invalid email format': '邮箱格式不正确',
  'Password is required': '必须输入密码',
  'Current password is required': '必须输入当前密码',
  'Refresh token is required': '必须提供刷新令牌',
  'Verification token is required': '必须提供验证令牌',
  'Verification code must be 6 digits': '验证码必须为 6 位数字',
  'Password must be at least 8 characters': '密码至少需要 8 位',
  'Password must contain at least one letter': '密码必须至少包含一个字母',
  'Password must contain at least one number': '密码必须至少包含一个数字',
  'Username must be at least 3 characters': '用户名至少需要 3 个字符',
  'Username must be at most 50 characters': '用户名最多 50 个字符',
  'Username can only contain letters, numbers, and underscores': '用户名只能包含字母、数字和下划线',
  'Passwords do not match': '两次输入的密码不一致',
  'Bio must be at most 500 characters': '个人简介最多 500 个字符',
  'Invalid URL format': 'URL 格式无效',
  'Avatar URL is too long': '头像 URL 过长',
  'An unexpected error occurred': '发生了未预期的错误',
  'Authentication required': '需要登录后访问',
  'Access denied': '无权访问',
  'Invalid request origin': '请求来源无效',
  'CSRF token required': '缺少 CSRF 令牌',
  'CSRF token mismatch': 'CSRF 令牌不匹配',
  'Authorization token required': '缺少授权令牌',
  'Invalid access token': '访问令牌无效',
  'Invalid access token type': '访问令牌类型无效',
  'Invalid access token subject': '访问令牌主体无效',
  'Access token has expired': '访问令牌已过期',
  'Access token has been revoked': '访问令牌已被撤销',
  'Refresh token required': '缺少刷新令牌',
  'Refresh token has expired': '刷新令牌已过期',
  'Refresh token has been revoked': '刷新令牌已被撤销',
  'Refresh token has already been used': '刷新令牌已被使用',
  'Refresh token user mismatch': '刷新令牌用户不匹配',
  'Invalid refresh token': '刷新令牌无效',
  'Invalid token type': '令牌类型无效',
  'Invalid refresh token session': '刷新令牌会话无效',
  'Invalid refresh token id': '刷新令牌 ID 无效',
  'Invalid refresh token subject': '刷新令牌主体无效',
  'Refresh token session mismatch': '刷新令牌会话不匹配',
  'Token validation failed': '令牌校验失败',
  'User not authenticated': '用户未登录',
  'User not found': '用户不存在',
  'Your account has been banned': '账号已被封禁',
  'User account is banned': '账号已被封禁',
  'Current password is incorrect': '当前密码不正确',
  'New password must be different from current password': '新密码不能与当前密码相同',
  'New email must be different from the current email': '新邮箱不能与当前邮箱相同',
  'This username is already taken': '用户名已被占用',
  'An account with this email already exists': '该邮箱已被注册',
  'Verification token does not match the provided email': '验证令牌与提供的邮箱不匹配',
  'Invalid or expired verification code': '验证码无效或已过期',
  'Invalid or expired code': '验证码无效或已过期',
  'Invalid verification token': '验证令牌无效',
  'Invalid verification token type': '验证令牌类型无效',
  'Verification token has expired. Please verify your email again.':
    '验证令牌已过期，请重新完成邮箱验证',
  'API key is required for custom provider': '自定义 Provider 必须提供 API Key',
  'Base URL is required for custom provider': '自定义 Provider 必须提供 Base URL',
  'OpenAI API key is required': '必须提供 OpenAI API Key',
  'Anthropic API key is required': '必须提供 Anthropic API Key',
  'Zhipu API key is required': '必须提供智谱 API Key',
  'DeepSeek API key is required': '必须提供 DeepSeek API Key',
  'Failed to send verification email. Please try again later.': '发送验证邮件失败，请稍后再试',
  'Too many verification codes requested. Please try again later.':
    '验证码请求过于频繁，请稍后再试',
  'Please wait 60 seconds before requesting another code': '请 60 秒后再重新请求验证码',
  'OAuth exchange code is required': '必须提供 OAuth 交换码',
  'No response body': '响应体为空',
  'No content returned from storage': '存储未返回内容',
  'Invalid file key encoding': '文件键编码无效',
  'File key is required': '必须提供文件键',
  'Invalid file key: path traversal detected': '文件键无效：检测到路径穿越',
  'Missing signature or expiration': '缺少签名或过期时间',
  'Invalid expiration format': '过期时间格式无效',
  'Invalid or expired signature': '签名无效或已过期',
  'Operation aborted': '操作已取消',
  'Rate limiter unavailable': '限流服务暂不可用',
  'Authentication rate limiter unavailable': '认证限流服务暂不可用',
  'Invalid Redis rate limiter response': '限流器返回值无效',
  'Invalid encrypted format': '加密内容格式无效',
  'Invalid environment variables': '环境变量校验失败',
  'No file uploaded': '未上传文件',
  'Session ID not found': '未找到会话 ID',
  'Session ID is required': '必须提供会话 ID',
  'Message not found': '消息不存在',
  'Only user messages can be edited': '仅用户消息支持编辑',
  'Document text is too large to chunk safely': '文档文本过大，无法安全分块',
  'VLM API key not configured. Set VLM_API_KEY in your environment.':
    'VLM API Key 未配置，请在环境变量中设置 VLM_API_KEY',
};

const PHRASE_ZH: Record<string, string> = {
  user: '用户',
  document: '文档',
  message: '消息',
  conversation: '会话',
  session: '会话',
  file: '文件',
  'knowledge base': '知识库',
  'knowledge base id': '知识库 ID',
  'document id': '文档 ID',
  'version id': '版本 ID',
  'resource id': '资源 ID',
  'resource type': '资源类型',
  'request origin': '请求来源',
  'csrf token': 'CSRF 令牌',
  'authorization token': '授权令牌',
  'access token': '访问令牌',
  'access token type': '访问令牌类型',
  'access token subject': '访问令牌主体',
  'refresh token': '刷新令牌',
  'refresh token session': '刷新令牌会话',
  'refresh token id': '刷新令牌 ID',
  'refresh token subject': '刷新令牌主体',
  token: '令牌',
  'oauth exchange code': 'OAuth 交换码',
  'oauth state token': 'OAuth 状态令牌',
  'email verification token': '邮箱验证令牌',
  'email verification subject': '邮箱验证令牌主体',
  'email verification type': '邮箱验证令牌类型',
  'verification token': '验证令牌',
  'verification token type': '验证令牌类型',
  'signature or expiration': '签名或过期时间',
  'expiration format': '过期时间格式',
  'file key': '文件键',
  'response body': '响应体',
  'backfill run': '回填任务',
  'document index version': '文档索引版本',
  'login attempts': '登录尝试',
  'registration attempts': '注册尝试',
  'refresh attempts': '刷新尝试',
  requests: '请求过于频繁',
  'ai requests': 'AI 请求',
  'email requests': '邮件请求',
  'verification attempts': '验证码验证尝试',
  'password reset attempts': '密码重置尝试',
  'current password': '当前密码',
  'new password': '新密码',
  'environment variables': '环境变量',
};

function extractHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function getRequest(target?: Request | Response): Request | undefined {
  if (!target) {
    return undefined;
  }

  if ('req' in target) {
    return target.req;
  }

  return target;
}

function hasChineseCharacters(message: string): boolean {
  return /[\u3400-\u9FFF]/.test(message);
}

function translatePhrase(phrase: string): string {
  const normalized = phrase.trim().toLowerCase();
  return PHRASE_ZH[normalized] ?? phrase;
}

function translateByPattern(message: string): string | undefined {
  const patterns: Array<[RegExp, (...matches: string[]) => string]> = [
    [/^(.+) not found$/i, (resource) => `${translatePhrase(resource)}不存在`],
    [/^Valid (.+) is required$/i, (subject) => `必须提供有效的${translatePhrase(subject)}`],
    [/^(.+) is required$/i, (subject) => `必须提供${translatePhrase(subject)}`],
    [
      /^(.+) is required when using (.+)$/i,
      (subject, provider) => {
        return `使用 ${provider} 时必须提供 ${translatePhrase(subject)}`;
      },
    ],
    [/^(.+) required$/i, (subject) => `必须提供${translatePhrase(subject)}`],
    [/^Invalid (.+)$/i, (subject) => `${translatePhrase(subject)}无效`],
    [
      /^Too many (.+) attempts, please try again later$/i,
      (subject) => {
        const translated = translatePhrase(subject);
        return translated === subject
          ? `操作过于频繁，请稍后再试`
          : `${translated}过于频繁，请稍后再试`;
      },
    ],
    [
      /^Too many (.+), please try again later$/i,
      (subject) => {
        const translated = translatePhrase(subject);
        return translated === subject
          ? `操作过于频繁，请稍后再试`
          : `${translated}过于频繁，请稍后再试`;
      },
    ],
    [
      /^Please wait (\d+) seconds before requesting another code$/i,
      (seconds) => {
        return `请 ${seconds} 秒后再重新请求验证码`;
      },
    ],
    [/^(.+) has expired$/i, (subject) => `${translatePhrase(subject)}已过期`],
    [/^(.+) has been revoked$/i, (subject) => `${translatePhrase(subject)}已被撤销`],
    [/^(.+) mismatch$/i, (subject) => `${translatePhrase(subject)}不匹配`],
    [/^Unknown (.+): (.+)$/i, (subject, value) => `未知${translatePhrase(subject)}：${value}`],
    [/^(.+?) API error: (.+)$/i, (provider, tail) => `${provider} API 错误：${tail}`],
    [
      /^(.+?) API error \((\d+)\): (.+)$/i,
      (provider, status, tail) => {
        return `${provider} API 错误（${status}）：${tail}`;
      },
    ],
    [
      /^(.+?) API request timed out after (.+)$/i,
      (provider, duration) => {
        return `${provider} API 请求超时，超时时间 ${duration}`;
      },
    ],
    [
      /^Avatar file too large\. Maximum size is (\d+)MB$/i,
      (size) => {
        return `头像文件过大，最大允许 ${size}MB`;
      },
    ],
  ];

  for (const [pattern, formatter] of patterns) {
    const matches = message.match(pattern);
    if (matches) {
      return formatter(...matches.slice(1));
    }
  }

  return undefined;
}

function getCodeFallbackMessage(code: string): string | undefined {
  const codeMessages: Record<string, string> = {
    VALIDATION_ERROR: '请求参数校验失败',
    NOT_FOUND: '资源不存在',
    UNAUTHORIZED: '未授权访问',
    INTERNAL_ERROR: '发生了未预期的错误',
    ACCESS_DENIED: '无权访问',
    TIMEOUT: '请求处理超时',
    REQUEST_ABORTED: '请求已取消',
    EXTERNAL_SERVICE_ERROR: '外部服务调用失败',
    TOKEN_INVALID: '令牌无效',
    TOKEN_EXPIRED: '令牌已过期',
    TOKEN_REVOKED: '令牌已被撤销',
    USER_BANNED: '账号已被封禁',
    MISSING_TOKEN: '缺少令牌',
    SESSION_NOT_FOUND: '会话不存在',
    RATE_LIMITED: '请求过于频繁，请稍后再试',
    EMAIL_ALREADY_EXISTS: '该邮箱已被注册',
    USERNAME_ALREADY_EXISTS: '用户名已被占用',
    INVALID_PASSWORD: '当前密码不正确',
    USER_NOT_FOUND: '用户不存在',
    CODE_INVALID: '验证码无效或已过期',
    CODE_EXPIRED: '验证码已过期',
    RESEND_COOLDOWN: '请求验证码过于频繁，请稍后再试',
    MAX_CODES_EXCEEDED: '验证码请求过于频繁，请稍后再试',
    VERIFICATION_TOKEN_INVALID: '验证令牌无效',
    VERIFICATION_TOKEN_EXPIRED: '验证令牌已过期',
    EMAIL_SEND_FAILED: '发送验证邮件失败，请稍后再试',
  };

  return codeMessages[code];
}

export function resolveServerLocale(target?: Request | Response): ServerLocale {
  const req = getRequest(target);
  const customLanguage = extractHeaderValue(req?.headers['x-language']);
  const acceptLanguage = extractHeaderValue(req?.headers['accept-language']);
  const source = `${customLanguage},${acceptLanguage}`.toLowerCase();

  if (source.includes('zh')) {
    return 'zh-CN';
  }

  if (source.includes('en')) {
    return 'en-US';
  }

  return 'en-US';
}

export function translateErrorMessage(
  message: string,
  locale: ServerLocale,
  code?: string
): string {
  if (locale === 'en-US' || !message || hasChineseCharacters(message)) {
    return message;
  }

  const exact = EXACT_ZH_MESSAGES[message];
  if (exact) {
    return exact;
  }

  const pattern = translateByPattern(message);
  if (pattern) {
    return pattern;
  }

  if (code) {
    const fallback = getCodeFallbackMessage(code);
    if (fallback) {
      return fallback;
    }
  }

  return message;
}

export function translateErrorDetails<T>(details: T, locale: ServerLocale): T {
  if (locale === 'en-US' || details == null) {
    return details;
  }

  if (typeof details === 'string') {
    return translateErrorMessage(details, locale) as T;
  }

  if (Array.isArray(details)) {
    return details.map((item) => translateErrorDetails(item, locale)) as T;
  }

  if (typeof details === 'object') {
    return Object.fromEntries(
      Object.entries(details as Record<string, unknown>).map(([key, value]) => [
        key,
        translateErrorDetails(value, locale),
      ])
    ) as T;
  }

  return details;
}

export function localizeApiError(error: ApiError, target?: Request | Response): ApiError {
  const locale = resolveServerLocale(target);
  if (locale === 'en-US') {
    return error;
  }

  return {
    ...error,
    message: translateErrorMessage(error.message, locale, error.code),
    details: translateErrorDetails(error.details, locale),
  };
}

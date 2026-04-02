import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { logClientError, logClientWarning } from '@/lib/logger';

function createAxiosError(): AxiosError {
  const config = {
    headers: new AxiosHeaders(),
    method: 'post',
    url: '/api/v1/auth/login?redirect=%2Fworkspace',
    data: JSON.stringify({
      email: 'user@example.com',
      password: 'Password123!',
      verificationToken: 'verified-token',
    }),
  } as InternalAxiosRequestConfig;

  const response = {
    config,
    data: {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    },
    headers: {},
    status: 401,
    statusText: 'Unauthorized',
  } as AxiosResponse;

  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    config,
    {},
    response
  );
}

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes axios errors without leaking auth request payloads', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = createAxiosError();

    logClientError('authStore.login', error, {
      email: 'user@example.com',
      verificationToken: 'verified-token',
      nested: {
        accessToken: 'access-token',
        conversationId: 'conversation-1',
      },
    });

    expect(consoleError).toHaveBeenCalledWith(
      '[authStore.login]',
      expect.objectContaining({
        name: 'AxiosError',
        message: 'Request failed with status code 401',
        code: 'ERR_BAD_REQUEST',
        status: 401,
        method: 'POST',
        url: '/api/v1/auth/login',
        apiErrorCode: 'INVALID_CREDENTIALS',
      }),
      {
        email: '[REDACTED]',
        verificationToken: '[REDACTED]',
        nested: {
          accessToken: '[REDACTED]',
          conversationId: 'conversation-1',
        },
      }
    );

    const [, safeError, safeMetadata] = consoleError.mock.calls[0] ?? [];
    const serializedPayload = JSON.stringify({ safeError, safeMetadata });

    expect(serializedPayload).not.toContain('user@example.com');
    expect(serializedPayload).not.toContain('Password123!');
    expect(serializedPayload).not.toContain('verified-token');
    expect(serializedPayload).not.toContain('access-token');
  });

  it('redacts sensitive warning metadata', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logClientWarning('security.session', 'refresh failed', {
      refreshToken: 'refresh-token',
      attempt: 2,
    });

    expect(consoleWarn).toHaveBeenCalledWith('[security.session] refresh failed', {
      refreshToken: '[REDACTED]',
      attempt: 2,
    });
  });
});

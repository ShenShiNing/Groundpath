import i18n from '@/i18n/i18n';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import type { AxiosError } from 'axios';

/**
 * Translate an API error by its error code.
 * Looks up `errors:api.{code}` first; falls back to the backend's English message.
 */
export function translateApiError(
  error: AxiosError<ApiResponse> | { code?: string; message?: string }
): string {
  const apiError = 'response' in error ? error.response?.data?.error : error;

  const code = apiError?.code;
  if (code) {
    const key = `errors:api.${code}`;
    if (i18n.exists(key)) {
      return i18n.t(key);
    }
  }

  return apiError?.message || i18n.t('errors:boundary.defaultMessage');
}

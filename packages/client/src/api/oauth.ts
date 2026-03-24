import type { ApiResponse, AuthResponse, OAuthExchangeRequest } from '@groundpath/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';

/**
 * Initiate GitHub OAuth login flow
 * @param returnUrl - URL to redirect to after successful login
 */
export function initiateGitHubLogin(returnUrl: string = '/'): void {
  const params = new URLSearchParams({ returnUrl });
  window.location.href = `/api/v1/auth/oauth/github?${params.toString()}`;
}

/**
 * Initiate Google OAuth login flow
 * @param returnUrl - URL to redirect to after successful login
 */
export function initiateGoogleLogin(returnUrl: string = '/'): void {
  const params = new URLSearchParams({ returnUrl });
  window.location.href = `/api/v1/auth/oauth/google?${params.toString()}`;
}

/**
 * Exchange one-time OAuth callback code for auth response.
 */
export async function exchangeOAuthCode(code: string): Promise<AuthResponse> {
  const payload: OAuthExchangeRequest = { code };
  const response = await apiClient.post<ApiResponse<AuthResponse>>(
    '/api/v1/auth/oauth/exchange',
    payload
  );
  return unwrapResponse(response.data);
}

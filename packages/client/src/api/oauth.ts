/**
 * Initiate GitHub OAuth login flow
 * @param returnUrl - URL to redirect to after successful login
 */
export function initiateGitHubLogin(returnUrl: string = '/'): void {
  const params = new URLSearchParams({ returnUrl });
  window.location.href = `/api/auth/oauth/github?${params.toString()}`;
}

/**
 * Initiate Google OAuth login flow
 * @param returnUrl - URL to redirect to after successful login
 */
export function initiateGoogleLogin(returnUrl: string = '/'): void {
  const params = new URLSearchParams({ returnUrl });
  window.location.href = `/api/auth/oauth/google?${params.toString()}`;
}

import { useEffect, useState } from 'react';
import type { AuthResponse } from '@knowledge-agent/shared/types';
import { exchangeOAuthCode } from '@/api';
import { useAuthStore } from '@/stores';

type CallbackStatus = 'processing' | 'success' | 'error';

interface UseOAuthCallbackOptions {
  search: Record<string, unknown>;
  navigateTo: (returnUrl: string) => void;
}

interface OAuthCallbackState {
  status: CallbackStatus;
  errorMessage: string | null;
}

const exchangePromiseCache = new Map<string, Promise<AuthResponse>>();
const exchangeResultCache = new Map<string, AuthResponse>();

async function exchangeOAuthCodeWithDedup(code: string): Promise<AuthResponse> {
  const cachedResult = exchangeResultCache.get(code);
  if (cachedResult) {
    return cachedResult;
  }

  const inFlight = exchangePromiseCache.get(code);
  if (inFlight) {
    return inFlight;
  }

  const promise = exchangeOAuthCode(code)
    .then((result) => {
      exchangeResultCache.set(code, result);
      return result;
    })
    .finally(() => {
      exchangePromiseCache.delete(code);
    });

  exchangePromiseCache.set(code, promise);
  return promise;
}

export function useOAuthCallback(options: UseOAuthCallbackOptions): OAuthCallbackState {
  const { search, navigateTo } = options;
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);

  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const processCallback = async () => {
      const { code, error, returnUrl: r } = search;
      const returnUrl = typeof r === 'string' ? r : '/dashboard';

      if (error) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(String(error));
        }
        return;
      }

      if (!code || typeof code !== 'string') {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('缺少认证参数');
        }
        return;
      }

      try {
        const authResponse = await exchangeOAuthCodeWithDedup(code);
        if (cancelled) return;

        setTokens({ accessToken: authResponse.tokens.accessToken });
        setUser(authResponse.user);
        setStatus('success');

        redirectTimer = setTimeout(() => {
          navigateTo(returnUrl);
        }, 1000);
      } catch {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage('认证交换失败，请重新登录');
      }
    };

    void processCallback();

    return () => {
      cancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [search, navigateTo, setTokens, setUser]);

  return { status, errorMessage };
}

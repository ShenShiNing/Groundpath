import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import type { UserPublicInfo } from '@knowledge-agent/shared/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';

type CallbackStatus = 'processing' | 'success' | 'error';

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);

  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = () => {
      const {
        accessToken,
        refreshToken,
        expiresIn,
        refreshExpiresIn,
        user,
        error,
        returnUrl: r,
      } = search;
      const returnUrl = (r as string) || '/';

      // Handle error case
      if (error) {
        setStatus('error');
        setErrorMessage(error as string);
        return;
      }

      // Validate tokens
      if (!accessToken || !refreshToken || !user || !expiresIn || !refreshExpiresIn) {
        setStatus('error');
        setErrorMessage('Missing authentication data');
        return;
      }

      try {
        // Parse user info (may be string or already-parsed object)
        const parsedUser = (typeof user === 'string' ? JSON.parse(user) : user) as UserPublicInfo;

        // Store tokens and user in auth store
        setTokens({
          accessToken: accessToken as string,
          refreshToken: refreshToken as string,
          expiresIn: Number(expiresIn),
          refreshExpiresIn: Number(refreshExpiresIn),
        });
        setUser(parsedUser);

        setStatus('success');

        // Redirect after short delay
        setTimeout(() => {
          navigate({ to: returnUrl });
        }, 1000);
      } catch {
        setStatus('error');
        setErrorMessage('Failed to process authentication response');
      }
    };

    processCallback();
  }, [search, setTokens, setUser, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'processing' && (
            <>
              <div className="mb-4 flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>Processing Login</CardTitle>
              <CardDescription>
                Please wait while we complete your authentication...
              </CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mb-4 flex justify-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Login Successful</CardTitle>
              <CardDescription>Redirecting you to your destination...</CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mb-4 flex justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>Authentication Failed</CardTitle>
              <CardDescription>{errorMessage || 'An error occurred during login'}</CardDescription>
            </>
          )}
        </CardHeader>

        {status === 'error' && (
          <CardContent className="flex flex-col gap-3">
            <Button onClick={() => navigate({ to: '/auth/login' })} className="w-full">
              Return to Login
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/' })} className="w-full">
              Go to Home
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default OAuthCallbackPage;

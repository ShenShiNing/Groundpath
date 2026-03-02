import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOAuthCallback } from '@/hooks';

export function OAuthCallbackPage() {
  const { t } = useTranslation('errors');
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const { status, errorMessage } = useOAuthCallback({
    search,
    navigateTo: (returnUrl) => navigate({ to: returnUrl }),
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md bg-card/85">
        <CardHeader className="text-center">
          {status === 'processing' && (
            <>
              <div className="mb-4 flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>{t('oauth.processing.title')}</CardTitle>
              <CardDescription>{t('oauth.processing.description')}</CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mb-4 flex justify-center">
                <CheckCircle className="h-12 w-12 text-emerald-500" />
              </div>
              <CardTitle>{t('oauth.success.title')}</CardTitle>
              <CardDescription>{t('oauth.success.description')}</CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mb-4 flex justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>{t('oauth.error.title')}</CardTitle>
              <CardDescription>{errorMessage || t('oauth.error.defaultMessage')}</CardDescription>
            </>
          )}
        </CardHeader>

        {status === 'error' && (
          <CardContent className="flex flex-col gap-3">
            <Button
              className="w-full cursor-pointer"
              onClick={() => navigate({ to: '/auth/login' })}
            >
              {t('oauth.action.backToLogin')}
            </Button>
            <Button
              variant="outline"
              className="w-full cursor-pointer"
              onClick={() => navigate({ to: '/' })}
            >
              {t('oauth.action.backToHome')}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default OAuthCallbackPage;

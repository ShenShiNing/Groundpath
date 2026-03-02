import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface RouteErrorProps {
  error: Error;
  reset?: () => void;
}

export function RouteError({ error, reset }: RouteErrorProps) {
  const { t } = useTranslation('errors');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="size-12 text-destructive" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t('route.title')}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || t('route.defaultMessage')}
        </p>
      </div>
      <div className="flex gap-2">
        {reset && (
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="mr-2 size-4" />
            {t('route.retry')}
          </Button>
        )}
        <Button asChild>
          <Link to="/dashboard">
            <Home className="mr-2 size-4" />
            {t('route.dashboard')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface RouteErrorProps {
  error: Error;
  reset?: () => void;
  titleKey?: string;
  defaultMessageKey?: string;
  dashboardLabelKey?: string;
}

export function RouteError({
  error,
  reset,
  titleKey = 'route.title',
  defaultMessageKey = 'route.defaultMessage',
  dashboardLabelKey = 'route.dashboard',
}: RouteErrorProps) {
  const { t } = useTranslation('errors');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="size-12 text-destructive" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t(titleKey)}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || t(defaultMessageKey)}
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
            {t(dashboardLabelKey)}
          </Link>
        </Button>
      </div>
    </div>
  );
}

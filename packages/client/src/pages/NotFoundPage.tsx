import { useNavigate } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores';

export function NotFoundPage() {
  const { t } = useTranslation('errors');
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAuthSession = isAuthenticated || !!accessToken;

  const primaryActionTarget = hasAuthSession ? '/dashboard' : '/';

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    navigate({ to: primaryActionTarget });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md bg-card/85">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <CardTitle>{t('notFound.title')}</CardTitle>
          <CardDescription>{t('notFound.description')}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <Button
            className="w-full cursor-pointer"
            onClick={() => navigate({ to: primaryActionTarget })}
          >
            {hasAuthSession ? t('notFound.backToDashboard') : t('notFound.backToHome')}
          </Button>
          <Button variant="outline" className="w-full cursor-pointer" onClick={handleBack}>
            {t('notFound.goBack')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default NotFoundPage;

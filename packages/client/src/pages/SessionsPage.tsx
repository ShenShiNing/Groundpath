import { Link } from '@tanstack/react-router';
import { ArrowUpRight, MonitorCheck, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/sessions';

export function SessionsPage() {
  const { t } = useTranslation('session');

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('page.title')}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{t('page.description')}</p>
            </div>
            <Button variant="outline" className="cursor-pointer" asChild>
              <Link to="/dashboard">
                {t('action.backToDashboard')}
                <ArrowUpRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <MonitorCheck className="size-4 text-primary" />
              <span className="text-muted-foreground">{t('stats.deviceManagement')}</span>
              <span className="font-display font-semibold">{t('stats.deviceManagementValue')}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="size-4 text-primary" />
              <span className="text-muted-foreground">{t('stats.securityTip')}</span>
              <span className="font-display font-semibold">{t('stats.securityTipValue')}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h2 className="text-lg font-semibold">{t('card.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('card.description')}</p>
          <div className="mt-6">
            <SessionList />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default SessionsPage;

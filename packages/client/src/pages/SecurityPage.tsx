import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown, ChevronUp, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AccountEmailForm, ChangePasswordForm } from '@/components/security';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';

type SecurityPanel = 'email' | 'password' | null;

export function SecurityPage() {
  const { t } = useTranslation('security');
  const user = useAuthStore((state) => state.user);
  const [activePanel, setActivePanel] = useState<SecurityPanel>(null);
  const tipItems = t('tips.items', { returnObjects: true }) as string[];
  const hasPassword = user?.hasPassword !== false;

  const togglePanel = (panel: Exclude<SecurityPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-5">
        <Button variant="outline" className="cursor-pointer" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 size-4" />
            {t('action.backToDashboard')}
          </Link>
        </Button>

        <div className="mt-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('page.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('page.description')}</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Mail className="size-4 text-primary" />
            <span className="text-muted-foreground">{t('stats.email')}</span>
            <span className="font-mono text-xs font-semibold">{user?.email}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-muted-foreground">{t('stats.emailVerified')}</span>
            <span className="font-display font-semibold">{t('stats.emailVerifiedValue')}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <KeyRound className="size-4 text-primary" />
            <span className="text-muted-foreground">{t('stats.password')}</span>
            <span className="font-display font-semibold">
              {hasPassword ? t('stats.passwordValue') : t('stats.passwordUnsetValue')}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 rounded-2xl border border-border/70 bg-background/70">
            <section className="px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{t('email.summary.title')}</h2>
                    {user?.emailVerified && (
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <ShieldCheck className="size-3.5" />
                        {t('email.verifiedBadge')}
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-sm">{user?.email}</p>
                  <p className="text-sm text-muted-foreground">{t('email.summary.description')}</p>
                </div>

                <Button
                  type="button"
                  variant={activePanel === 'email' ? 'secondary' : 'outline'}
                  className="cursor-pointer self-start"
                  onClick={() => togglePanel('email')}
                >
                  {activePanel === 'email' ? (
                    <>
                      {t('panel.collapse')}
                      <ChevronUp className="ml-1 size-4" />
                    </>
                  ) : (
                    <>
                      {t('email.summary.action')}
                      <ChevronDown className="ml-1 size-4" />
                    </>
                  )}
                </Button>
              </div>

              {activePanel === 'email' && (
                <div className="mt-6 border-t pt-6">
                  <AccountEmailForm onSuccess={() => setActivePanel(null)} />
                </div>
              )}
            </section>

            <section className="border-t px-6 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">
                    {hasPassword ? t('password.summary.title') : t('password.setup.summary.title')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {hasPassword
                      ? t('password.summary.description')
                      : t('password.setup.summary.description')}
                  </p>
                </div>

                <Button
                  type="button"
                  variant={activePanel === 'password' ? 'secondary' : 'outline'}
                  className="cursor-pointer self-start"
                  onClick={() => togglePanel('password')}
                >
                  {activePanel === 'password' ? (
                    <>
                      {t('panel.collapse')}
                      <ChevronUp className="ml-1 size-4" />
                    </>
                  ) : (
                    <>
                      {hasPassword
                        ? t('password.summary.action')
                        : t('password.setup.summary.action')}
                      <ChevronDown className="ml-1 size-4" />
                    </>
                  )}
                </Button>
              </div>

              {activePanel === 'password' && (
                <div className="mt-6 border-t pt-6">
                  <ChangePasswordForm onSuccess={() => setActivePanel(null)} />
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start xl:border-l xl:pl-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t('tips.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('tips.description')}</p>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {tipItems.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default SecurityPage;

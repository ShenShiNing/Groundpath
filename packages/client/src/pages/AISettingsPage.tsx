import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Bot, CheckCircle2, CircleSlash, Cpu } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { AISettingsForm } from '@/components/settings';
import { useLLMConfig, useLLMProviders } from '@/hooks/useLLMConfig';

export function AISettingsPage() {
  const { t } = useTranslation('settings');
  const { data: config } = useLLMConfig();
  const { data: providers = [] } = useLLMProviders();

  const isConfigured = !!config?.provider && !!config?.model;
  const currentProviderName = config?.provider
    ? (providers.find((p) => p.provider === config.provider)?.name ?? config.provider)
    : null;

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
              <Bot className="size-4 text-primary" />
              <span className="text-muted-foreground">{t('stats.currentProvider')}</span>
              <span className="font-display font-semibold">
                {currentProviderName ?? t('stats.notConfigured')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <Cpu className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('stats.currentModel')}</span>
              <span className="font-semibold font-mono text-xs">
                {config?.model ?? t('stats.notConfigured')}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              {isConfigured ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {t('stats.configured')}
                  </span>
                </>
              ) : (
                <>
                  <CircleSlash className="size-4 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground">
                    {t('stats.notConfigured')}
                  </span>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl">
            <AISettingsForm />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default AISettingsPage;

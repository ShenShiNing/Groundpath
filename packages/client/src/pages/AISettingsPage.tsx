import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleSlash,
  Cpu,
  Info,
  KeyRound,
  Lightbulb,
  ShieldCheck,
} from 'lucide-react';
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
    <div className="flex-1 flex flex-col overflow-hidden">
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
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 xl:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            <AISettingsForm />
          </div>

          <aside className="hidden space-y-6 xl:block xl:sticky xl:top-0 xl:self-start">
            <div className="rounded-lg border bg-muted/30 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Info className="size-4 text-primary" />
                {t('sidebar.statusTitle')}
              </h3>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('sidebar.provider')}</span>
                  <span className="font-medium">{currentProviderName ?? t('sidebar.unset')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('sidebar.model')}</span>
                  <span className="max-w-[10rem] truncate font-mono text-xs font-medium">
                    {config?.model ?? t('sidebar.unset')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('sidebar.apiKey')}</span>
                  {config?.hasApiKey ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="size-3.5" />
                      {t('sidebar.saved')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t('sidebar.unset')}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('sidebar.status')}</span>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" />
                      {t('sidebar.ready')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <CircleSlash className="size-3" />
                      {t('sidebar.incomplete')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="size-4 text-amber-500" />
                {t('sidebar.guideTitle')}
              </h3>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </span>
                  <span>{t('sidebar.step1')}</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    2
                  </span>
                  <span>{t('sidebar.step2')}</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    3
                  </span>
                  <span>{t('sidebar.step3')}</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    4
                  </span>
                  <span>{t('sidebar.step4')}</span>
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4 text-primary" />
                {t('sidebar.securityTitle')}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('sidebar.securityDescription')}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default AISettingsPage;

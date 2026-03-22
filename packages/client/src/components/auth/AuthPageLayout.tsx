import { Link } from '@tanstack/react-router';
import { Brain } from 'lucide-react';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footer: React.ReactNode;
}

function AuthHeader() {
  const { t } = useTranslation(['auth', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAuthSession = isAuthenticated || !!accessToken;

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="container">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-2xl border bg-background/85 px-4 shadow-sm backdrop-blur-md">
          <Link
            to={hasAuthSession ? '/dashboard' : '/'}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </div>
            <span className="font-display text-base font-semibold tracking-tight">
              {t('brand', { ns: 'common' })}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden cursor-pointer sm:inline-flex"
              asChild
            >
              <Link to="/">{t('header.home')}</Link>
            </Button>
            {hasAuthSession && (
              <Button size="sm" className="hidden cursor-pointer sm:inline-flex" asChild>
                <Link to="/dashboard">{t('header.console')}</Link>
              </Button>
            )}
            <LanguageToggle />
            <ModeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export function AuthPageLayout({ children, title, description, footer }: AuthPageLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <AuthHeader />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-176 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-20 bottom-8 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <div className="flex min-h-screen items-center justify-center px-4 pt-20 pb-8">
        <div className="w-full max-w-md py-8">
          <div className="mb-8 flex flex-col items-center space-y-2 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer}
        </div>
      </div>
    </div>
  );
}

interface AuthFooterLinkProps {
  text: string;
  linkText: string;
  linkTo: string;
}

export function AuthFooterLink({ text, linkText, linkTo }: AuthFooterLinkProps) {
  return (
    <p className="text-center text-sm text-muted-foreground mt-6">
      {text}{' '}
      <Link to={linkTo} className="font-semibold hover:underline underline-offset-4 cursor-pointer">
        {linkText}
      </Link>
    </p>
  );
}

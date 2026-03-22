import { useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowRight,
  Brain,
  ChevronDown,
  Database,
  FileSearch,
  Files,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/components/theme/theme-provider';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';

const capabilityCards = [
  {
    icon: Files,
    titleKey: 'capability.docs.title',
    descriptionKey: 'capability.docs.description',
  },
  {
    icon: FileSearch,
    titleKey: 'capability.search.title',
    descriptionKey: 'capability.search.description',
  },
  {
    icon: ShieldCheck,
    titleKey: 'capability.traceable.title',
    descriptionKey: 'capability.traceable.description',
  },
] as const;

const workflowSteps = [
  {
    index: '01',
    titleKey: 'workflow.step1.title',
    descriptionKey: 'workflow.step1.description',
  },
  {
    index: '02',
    titleKey: 'workflow.step2.title',
    descriptionKey: 'workflow.step2.description',
  },
  {
    index: '03',
    titleKey: 'workflow.step3.title',
    descriptionKey: 'workflow.step3.description',
  },
] as const;

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function HomeUserMenu() {
  const { t } = useTranslation(['home', 'common']);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const displayName = user?.username ?? t('user', { ns: 'common' });
  const initials = getUserInitials(user?.username, user?.email);

  const handleLogout = useCallback(async () => {
    await logout();
    await router.navigate({ to: '/' });
  }, [logout, router]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-1.5 rounded-full border bg-card/70 px-1.5 py-1 transition-colors hover:bg-accent/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label={t('openUserMenu')}
        >
          <Avatar size="sm">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/dashboard">
              <LayoutDashboard className="size-4 mr-2" />
              {t('dashboard', { ns: 'common' })}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/profile">
              <User className="size-4 mr-2" />
              {t('profile', { ns: 'common' })}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to="/sessions">
              <Monitor className="size-4 mr-2" />
              {t('sessions', { ns: 'common' })}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onSelect={() => {
            void handleLogout();
          }}
        >
          <LogOut className="size-4 mr-2" />
          {t('logout', { ns: 'common' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Navbar() {
  const { t } = useTranslation(['home', 'common']);
  const { theme, setTheme } = useTheme();
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
            <LanguageToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="cursor-pointer"
            >
              <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
              <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
              <span className="sr-only">{t('theme.toggle')}</span>
            </Button>

            {hasAuthSession ? (
              <HomeUserMenu />
            ) : (
              <>
                <Button variant="ghost" size="sm" className="cursor-pointer" asChild>
                  <Link to="/auth/login">{t('login')}</Link>
                </Button>
                <Button size="sm" className="cursor-pointer" asChild>
                  <Link to="/auth/signup">{t('getStarted')}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const HomePage = () => {
  const { t } = useTranslation(['home', 'common']);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAuthSession = isAuthenticated || !!accessToken;
  const ctaPrimaryKey = hasAuthSession ? 'cta.primary.auth' : 'cta.primary.guest';

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <Navbar />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-176 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <section className="container pt-36 pb-18 md:pt-44 md:pb-22">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            {t('hero.badge')}
          </div>

          <h1 className="font-display mt-6 max-w-4xl text-4xl font-bold leading-[1.15] tracking-tight text-balance sm:text-5xl md:text-6xl">
            {t('hero.title')}
            <span className="text-muted-foreground"> {t('hero.titleMuted')}</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t('hero.description')}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {hasAuthSession ? (
              <Button size="lg" className="cursor-pointer" asChild>
                <Link to="/dashboard">
                  {t('hero.enterDashboard')}
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" className="cursor-pointer" asChild>
                  <Link to="/auth/signup">
                    {t('hero.startBuilding')}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                  <Link to="/auth/login">{t('hero.loginNow')}</Link>
                </Button>
              </>
            )}
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{t('metrics.searchTime')}</p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {t('metrics.searchTimeValue')}
              </p>
            </div>
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{t('metrics.docTypes')}</p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {t('metrics.docTypesValue')}
              </p>
            </div>
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">{t('metrics.answerMode')}</p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {t('metrics.answerModeValue')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t('capabilities.label')}
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">
                {t('capabilities.title')}
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {capabilityCards.map(({ icon: Icon, titleKey, descriptionKey }) => (
              <article
                key={titleKey}
                className="rounded-2xl border bg-card/80 p-6 transition-colors duration-200 hover:bg-accent/40"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{t(titleKey)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(descriptionKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-card/60 p-6 sm:p-8 md:p-10">
          <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-4" />
            {t('workflow.title')}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {workflowSteps.map((step) => (
              <div key={step.index} className="space-y-3">
                <p className="font-display text-xl font-bold text-primary">{step.index}</p>
                <h3 className="text-lg font-semibold">{t(step.titleKey)}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{t(step.descriptionKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container pt-8 pb-18 md:pb-24">
        <div className="mx-auto max-w-4xl rounded-3xl border bg-card p-8 text-center sm:p-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t('cta.description')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="cursor-pointer" asChild>
              <Link to={hasAuthSession ? '/dashboard' : '/auth/signup'}>
                {t(ctaPrimaryKey)}
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="cursor-pointer" asChild>
              <Link to="/about">{t('cta.secondary')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} {t('brand', { ns: 'common' })}
            </p>
            <div className="flex items-center gap-5">
              <Link
                to="/about"
                className="cursor-pointer transition-colors duration-200 hover:text-foreground"
              >
                {t('footer.about')}
              </Link>
              <Link
                to={hasAuthSession ? '/dashboard' : '/auth/login'}
                className="cursor-pointer transition-colors duration-200 hover:text-foreground"
              >
                {t('footer.console')}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

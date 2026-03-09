import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Database, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserSummary, QuickLinks, StructuredRagOverview } from '@/components/dashboard';
import { useKnowledgeBases } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const user = useAuthStore((state) => state.user);
  const { data: knowledgeBases = [] } = useKnowledgeBases();
  const totalDocuments = knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-5">
        <p className="text-sm text-muted-foreground">{t('hero.welcome')}</p>
        <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {user?.username
            ? t('hero.titleWithUser', { username: user.username })
            : t('hero.titleDefault')}
        </h1>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button className="cursor-pointer" asChild>
            <Link to="/knowledge-bases">
              {t('hero.openKnowledgeBases')}
              <ArrowUpRight className="ml-1 size-4" />
            </Link>
          </Button>
          <Button variant="outline" className="cursor-pointer" asChild>
            <Link to="/settings/ai">{t('hero.configureModel')}</Link>
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t('stats.knowledgeBaseCount')}</span>
            <span className="font-display text-lg font-semibold">{knowledgeBases.length}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t('stats.documentCount')}</span>
            <span className="font-display text-lg font-semibold">{totalDocuments}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <section>
          <UserSummary />
        </section>

        <section className="mt-6">
          <StructuredRagOverview />
        </section>

        <section className="mt-6">
          <QuickLinks />
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;

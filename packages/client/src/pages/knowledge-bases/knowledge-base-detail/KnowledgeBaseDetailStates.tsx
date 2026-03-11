import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

function CenteredState({ title, description }: { title: string; description: string }) {
  const { t } = useTranslation(['knowledgeBase', 'common']);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-xl p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold">{title}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{description}</p>
        <Button className="cursor-pointer" asChild>
          <Link to="/knowledge-bases">{t('detail.action.backToList')}</Link>
        </Button>
      </div>
    </div>
  );
}

export function KnowledgeBaseDetailMissingIdState() {
  const { t } = useTranslation('knowledgeBase');

  return (
    <CenteredState
      title={t('detail.notFound.title')}
      description={t('detail.notFound.description')}
    />
  );
}

export function KnowledgeBaseDetailLoadingState() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>
      <div className="shrink-0 border-b px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="ml-auto h-8 w-48" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {[...Array(12)].map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBaseDetailErrorState() {
  const { t } = useTranslation(['knowledgeBase', 'common']);

  return (
    <CenteredState
      title={t('detail.error.loadFailed')}
      description={t('error.generic', { ns: 'common' })}
    />
  );
}

export function KnowledgeBaseDetailNotFoundState() {
  const { t } = useTranslation('knowledgeBase');

  return (
    <CenteredState
      title={t('detail.notFound.title')}
      description={t('detail.notFound.description')}
    />
  );
}

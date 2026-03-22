import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileText, Layers, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import type { KnowledgeBaseInfo } from '@groundpath/shared/types';

interface KnowledgeBaseDetailHeaderProps {
  knowledgeBase: KnowledgeBaseInfo;
  onOpenSettings: () => void;
}

export function KnowledgeBaseDetailHeader({
  knowledgeBase,
  onOpenSettings,
}: KnowledgeBaseDetailHeaderProps) {
  const { t } = useTranslation('knowledgeBase');

  return (
    <header className="shrink-0 border-b px-6 py-4">
      <div className="flex flex-wrap items-start gap-3 md:gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 cursor-pointer" asChild>
              <Link to="/knowledge-bases">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('detail.tooltip.backToList')}</TooltipContent>
        </Tooltip>

        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display truncate text-xl font-semibold leading-tight">
              {knowledgeBase.name}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{t('detail.subtitle')}</p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 cursor-pointer"
                onClick={onOpenSettings}
                aria-label={t('detail.tooltip.settings')}
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('detail.tooltip.settings')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3.5" />
          {t('detail.stats.documents', { count: knowledgeBase.documentCount })}
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3.5" />
          {t('detail.stats.chunks', { count: knowledgeBase.totalChunks })}
        </span>
      </div>
    </header>
  );
}

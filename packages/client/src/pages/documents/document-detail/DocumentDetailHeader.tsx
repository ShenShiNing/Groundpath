import type { DocumentType } from '@groundpath/shared/types';
import { ArrowLeft, Download, Eye, FileText, History, PencilLine, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ViewMode } from '../documentDetailMode';

interface DocumentDetailHeaderProps {
  title: string;
  documentType?: DocumentType;
  currentVersion: number;
  isPageLoading: boolean;
  showActions: boolean;
  isEditable: boolean;
  mode: ViewMode;
  onBack: () => void;
  onReadMode: () => void;
  onEditMode: () => void;
  onAiRewrite: () => void;
  onDownload: () => void;
}

export function DocumentDetailHeader({
  title,
  documentType,
  currentVersion,
  isPageLoading,
  showActions,
  isEditable,
  mode,
  onBack,
  onReadMode,
  onEditMode,
  onAiRewrite,
  onDownload,
}: DocumentDetailHeaderProps) {
  const { t } = useTranslation(['document', 'common']);

  return (
    <header className="shrink-0 border-b px-6 py-5">
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 cursor-pointer"
          aria-label={t('action.backToList')}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {isPageLoading ? t('loading') : title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" />
              {documentType?.toUpperCase() ?? 'DOCUMENT'}
            </span>
            <span className="inline-flex items-center gap-1">
              <History className="size-3.5" />
              {currentVersion
                ? t('versions.currentNumber', { version: currentVersion })
                : t('versions.currentPending')}
            </span>
            <span>{t('page.subtitle')}</span>
          </div>
        </div>

        {showActions && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={mode === 'read' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={onReadMode}
            >
              <Eye className="size-4 mr-1.5" />
              {t('action.read')}
            </Button>

            {isEditable && (
              <Button
                variant={mode === 'edit' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={onEditMode}
              >
                <PencilLine className="size-4 mr-1.5" />
                {t('action.edit')}
              </Button>
            )}

            {isEditable && (
              <Button variant="outline" className="cursor-pointer" onClick={onAiRewrite}>
                <Wand2 className="size-4 mr-1.5" />
                {t('action.aiRewrite')}
              </Button>
            )}

            <Button variant="outline" className="cursor-pointer" onClick={onDownload}>
              <Download className="size-4 mr-1.5" />
              {t('action.download')}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

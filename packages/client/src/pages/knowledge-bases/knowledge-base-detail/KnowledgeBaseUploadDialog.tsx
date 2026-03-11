import { Button } from '@/components/ui/button';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { useTranslation } from 'react-i18next';

interface KnowledgeBaseUploadDialogProps {
  open: boolean;
  knowledgeBaseId: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function KnowledgeBaseUploadDialog({
  open,
  knowledgeBaseId,
  onOpenChange,
  onSuccess,
}: KnowledgeBaseUploadDialogProps) {
  const { t } = useTranslation(['knowledgeBase', 'common']);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('detail.upload.title')}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            {t('close', { ns: 'common' })}
          </Button>
        </div>
        <DocumentUpload knowledgeBaseId={knowledgeBaseId} onSuccess={onSuccess} />
      </div>
    </div>
  );
}

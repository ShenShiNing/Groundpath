import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import type { DeleteDialogState } from './types';

interface KnowledgeBaseDeleteDialogProps {
  deleteDialog: DeleteDialogState;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function KnowledgeBaseDeleteDialog({
  deleteDialog,
  onOpenChange,
  onConfirm,
}: KnowledgeBaseDeleteDialogProps) {
  const { t } = useTranslation(['knowledgeBase', 'common']);

  return (
    <AlertDialog open={deleteDialog.open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('detail.delete.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteDialog.documents.length === 1
              ? t('detail.delete.confirmSingle', {
                  title: deleteDialog.documents[0]?.title ?? '',
                })
              : t('detail.delete.confirmMultiple', {
                  count: deleteDialog.documents.length,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">
            {t('cancel', { ns: 'common' })}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={onConfirm}>
            {t('delete', { ns: 'common' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

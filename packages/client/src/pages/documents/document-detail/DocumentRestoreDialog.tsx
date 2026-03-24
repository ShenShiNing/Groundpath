import type { DocumentVersionListItem } from '@groundpath/shared/types';
import { useTranslation } from 'react-i18next';
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

interface DocumentRestoreDialogProps {
  open: boolean;
  selectedVersion: DocumentVersionListItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DocumentRestoreDialog({
  open,
  selectedVersion,
  onOpenChange,
  onConfirm,
}: DocumentRestoreDialogProps) {
  const { t } = useTranslation(['document', 'common']);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('versions.dialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('versions.dialog.description', { version: selectedVersion?.version ?? '-' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">
            {t('cancel', { ns: 'common' })}
          </AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer" onClick={onConfirm}>
            {t('versions.dialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

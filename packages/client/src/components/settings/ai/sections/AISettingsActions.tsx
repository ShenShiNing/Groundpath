import { Loader2, Save, Trash2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AISettingsActionsProps {
  clearDialogOpen: boolean;
  hasConfig: boolean;
  isBusy: boolean;
  isSaving: boolean;
  isClearing: boolean;
  isTesting: boolean;
  canSave: boolean;
  canTest: boolean;
  onClearDialogOpenChange: (open: boolean) => void;
  onClearConfig: () => void;
  onTest: () => void;
  onSave: () => void;
}

export function AISettingsActions({
  clearDialogOpen,
  hasConfig,
  isBusy,
  isSaving,
  isClearing,
  isTesting,
  canSave,
  canTest,
  onClearDialogOpenChange,
  onClearConfig,
  onTest,
  onSave,
}: AISettingsActionsProps) {
  const { t } = useTranslation(['settings', 'common']);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <AlertDialog open={clearDialogOpen} onOpenChange={onClearDialogOpenChange}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" disabled={!hasConfig || isBusy}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t('form.clearConfig')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('form.clearConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('form.clearConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>
              {t('cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isClearing} onClick={onClearConfig}>
              {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('form.clearConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onTest} disabled={!canTest}>
          {isTesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Zap className="mr-2 h-4 w-4" />
          )}
          {t('form.testConnection')}
        </Button>

        <Button type="button" onClick={onSave} disabled={!canSave}>
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t('form.save')}
        </Button>
      </div>
    </div>
  );
}

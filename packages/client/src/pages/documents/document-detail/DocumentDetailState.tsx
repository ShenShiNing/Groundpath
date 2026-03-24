import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface DocumentDetailStateProps {
  message: string;
  onAction: () => void;
  tone?: 'default' | 'destructive';
}

export function DocumentDetailState({
  message,
  onAction,
  tone = 'default',
}: DocumentDetailStateProps) {
  const { t } = useTranslation(['document', 'common']);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="py-14 text-center">
        <p className={tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}>
          {message}
        </p>
        <Button variant="outline" className="mt-4 cursor-pointer" onClick={onAction}>
          {t('action.backToList')}
        </Button>
      </div>
    </div>
  );
}

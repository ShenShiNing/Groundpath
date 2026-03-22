import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProcessingStatus } from '@groundpath/shared/types';
import { useTranslation } from 'react-i18next';

interface ProcessingStatusBadgeProps {
  status: ProcessingStatus;
  error?: string | null;
  className?: string;
  showLabel?: boolean;
}

export function ProcessingStatusBadge({
  status,
  error,
  className,
  showLabel = true,
}: ProcessingStatusBadgeProps) {
  const { t } = useTranslation('document');
  const statusConfig: Record<
    ProcessingStatus,
    { label: string; icon: typeof Clock; className: string }
  > = {
    pending: {
      label: t('status.pending'),
      icon: Clock,
      className: 'bg-muted text-muted-foreground border-muted-foreground/20',
    },
    processing: {
      label: t('status.processing'),
      icon: Loader2,
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
    },
    completed: {
      label: t('status.completed'),
      icon: CheckCircle2,
      className: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
    },
    failed: {
      label: t('status.failed'),
      icon: XCircle,
      className: 'bg-destructive/10 text-destructive border-destructive/20',
    },
  };
  const config = statusConfig[status];
  const Icon = config.icon;

  const badge = (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      <Icon className={cn('size-3', status === 'processing' && 'animate-spin')} />
      {showLabel && <span>{config.label}</span>}
    </div>
  );

  if (status === 'failed' && error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

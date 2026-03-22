import type { EmbeddingProviderType } from '@groundpath/shared/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EmbeddingProviderBadgeProps {
  provider: EmbeddingProviderType;
  className?: string;
}

const providerConfig: Record<
  EmbeddingProviderType,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  zhipu: { label: 'Zhipu', variant: 'default' },
  openai: { label: 'OpenAI', variant: 'secondary' },
  ollama: { label: 'Ollama', variant: 'outline' },
};

export function EmbeddingProviderBadge({ provider, className }: EmbeddingProviderBadgeProps) {
  const config = providerConfig[provider];

  return (
    <Badge variant={config.variant} className={cn('text-xs', className)}>
      {config.label}
    </Badge>
  );
}

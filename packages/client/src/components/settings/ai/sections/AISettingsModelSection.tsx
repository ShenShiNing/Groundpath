import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ModelSelector } from '../ModelSelector';
import type { AISettingsModelInfo } from '../types';

interface AISettingsModelSectionProps {
  model: string;
  models: AISettingsModelInfo[];
  modelsLoading: boolean;
  modelsError: boolean;
  canFetch: boolean;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  isBusy: boolean;
  onModelChange: (value: string) => void;
  onRefresh: () => void;
}

export function AISettingsModelSection({
  model,
  models,
  modelsLoading,
  modelsError,
  canFetch,
  requiresApiKey,
  requiresBaseUrl,
  isBusy,
  onModelChange,
  onRefresh,
}: AISettingsModelSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <section>
      <div className="mb-4">
        <h3 className="text-base font-medium">{t('section.model')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('section.modelDescription')}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="model">{t('form.model')}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={modelsLoading}
            className="h-6 px-2 text-xs"
          >
            {modelsLoading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            {t('form.refresh')}
          </Button>
        </div>
        <div className="max-w-md">
          <ModelSelector
            value={model}
            models={models}
            isLoading={modelsLoading}
            isError={modelsError}
            canFetch={canFetch}
            requiresApiKey={requiresApiKey}
            requiresBaseUrl={requiresBaseUrl}
            disabled={isBusy}
            onValueChange={onModelChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('form.modelHelper')}</p>
      </div>
    </section>
  );
}

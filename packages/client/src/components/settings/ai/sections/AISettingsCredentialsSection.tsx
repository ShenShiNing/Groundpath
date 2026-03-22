import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LLMProviderType } from '@groundpath/shared/types';
import type { AISettingsConfig, AISettingsFormValues, AISettingsProviderInfo } from '../types';

interface AISettingsCredentialsSectionProps {
  config: AISettingsConfig;
  providers: AISettingsProviderInfo[];
  values: AISettingsFormValues;
  isBusy: boolean;
  showApiKeyField: boolean;
  showApiKey: boolean;
  hasSavedKey: boolean;
  showUnreadableApiKeyWarning: boolean;
  showBaseUrlField: boolean;
  optionalBaseUrl: boolean;
  defaultBaseUrl?: string;
  onProviderChange: (provider: LLMProviderType) => void;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onToggleShowApiKey: () => void;
}

export function AISettingsCredentialsSection({
  config,
  providers,
  values,
  isBusy,
  showApiKeyField,
  showApiKey,
  hasSavedKey,
  showUnreadableApiKeyWarning,
  showBaseUrlField,
  optionalBaseUrl,
  defaultBaseUrl,
  onProviderChange,
  onApiKeyChange,
  onBaseUrlChange,
  onToggleShowApiKey,
}: AISettingsCredentialsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <section>
      <div className="mb-4">
        <h3 className="text-base font-medium">{t('section.credentials')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('section.credentialsDescription')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="provider">{t('form.provider')}</Label>
          <Select
            value={values.provider}
            onValueChange={(value) => onProviderChange(value as LLMProviderType)}
            disabled={isBusy}
          >
            <SelectTrigger id="provider">
              <SelectValue placeholder={t('form.providerPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.provider} value={provider.provider}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('form.providerHelper')}</p>
        </div>

        {showApiKeyField && (
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {t('form.apiKeyLabel')}
              {hasSavedKey && config?.apiKeyMasked && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('form.currentApiKey', { masked: config.apiKeyMasked })}
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={values.apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder={
                  hasSavedKey ? t('form.apiKeyPlaceholderUpdate') : t('form.apiKeyPlaceholder')
                }
                disabled={isBusy}
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={onToggleShowApiKey}
                disabled={isBusy}
                aria-label={showApiKey ? t('form.hideApiKey') : t('form.showApiKey')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {showUnreadableApiKeyWarning && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{t('form.apiKeyUnreadable')}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {values.provider === 'custom' ? t('form.apiKeyHelperCustom') : t('form.apiKeyHelper')}
            </p>
          </div>
        )}

        {showBaseUrlField && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="baseUrl">
              {t('form.baseUrlLabel')}
              {optionalBaseUrl && (
                <span className="ml-2 text-xs text-muted-foreground">{t('form.optional')}</span>
              )}
            </Label>
            <Input
              id="baseUrl"
              type="url"
              value={values.baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              placeholder={defaultBaseUrl ?? 'https://api.example.com'}
              disabled={isBusy}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {optionalBaseUrl
                ? t('form.baseUrlHelperOptional', {
                    defaultUrl: defaultBaseUrl ?? '',
                  })
                : t('form.baseUrlHelper')}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

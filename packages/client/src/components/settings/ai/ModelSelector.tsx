import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';

export interface ModelSelectorProps {
  value: string;
  models: { id: string; name?: string }[];
  isLoading: boolean;
  isError: boolean;
  canFetch: boolean;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
}

export function ModelSelector({
  value,
  models,
  isLoading,
  isError,
  canFetch,
  requiresApiKey,
  requiresBaseUrl,
  disabled,
  onValueChange,
}: ModelSelectorProps) {
  const { t } = useTranslation('settings');
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = useState('');

  const filteredModels = useMemo(() => {
    if (!models.length || !searchInput.trim()) return models;
    const search = searchInput.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(search) || m.name?.toLowerCase().includes(search)
    );
  }, [models, searchInput]);

  const selectedModel = models.find((m) => m.id === value);
  const displayValue = searchInput || selectedModel?.name || value;

  function getEmptyMessage() {
    if (isLoading) return t('form.modelsLoading');
    if (isError) return t('form.modelsError');
    if (!canFetch) {
      if (requiresApiKey && requiresBaseUrl) return t('form.needsApiKeyAndBaseUrl');
      if (requiresApiKey) return t('form.needsApiKey');
      return t('form.needsApiKeyAndBaseUrl');
    }
    if (searchInput.trim()) return t('form.pressEnterToUse', { model: searchInput.trim() });
    return t('form.noModels');
  }

  return (
    <Combobox
      value={value}
      onValueChange={(v) => {
        onValueChange(v ?? '');
        setSearchInput('');
      }}
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setSearchInput('');
        }
      }}
      disabled={disabled || isLoading}
    >
      <ComboboxInput
        id="model"
        placeholder={t('form.modelPlaceholder')}
        value={displayValue}
        onChange={(e) => {
          setSearchInput(e.target.value);
          if (!open) {
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && searchInput.trim()) {
            e.preventDefault();
            onValueChange(searchInput.trim());
            setSearchInput('');
            setOpen(false);
          }
        }}
        disabled={disabled || isLoading}
        showTrigger
      />
      <ComboboxContent>
        <ComboboxList>
          {filteredModels.map((m) => (
            <ComboboxItem key={m.id} value={m.id}>
              {m.name ?? m.id}
            </ComboboxItem>
          ))}
        </ComboboxList>
        {filteredModels.length === 0 && (
          <div className="py-2 text-center text-sm text-muted-foreground">{getEmptyMessage()}</div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

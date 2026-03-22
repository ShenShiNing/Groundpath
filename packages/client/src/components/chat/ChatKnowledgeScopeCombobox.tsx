import { useMemo, useState } from 'react';
import { Database, MessageSquareText } from 'lucide-react';
import type { KnowledgeBaseListItem } from '@groundpath/shared/types';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { useTranslation } from 'react-i18next';
import { CHAT_SELECTOR_INPUT_CLASSNAME } from './chatSelectorStyles';

export interface ChatKnowledgeScopeComboboxProps {
  knowledgeBases: KnowledgeBaseListItem[];
  value: string | null;
  disabled?: boolean;
  onValueChange: (knowledgeBaseId: string | null) => void;
}

const GENERAL_SCOPE_VALUE = '__general__';

interface ChatScopeOption {
  value: string;
  label: string;
  description: string;
  searchText: string;
}

export function ChatKnowledgeScopeCombobox({
  knowledgeBases,
  value,
  disabled = false,
  onValueChange,
}: ChatKnowledgeScopeComboboxProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const options = useMemo<ChatScopeOption[]>(
    () => [
      {
        value: GENERAL_SCOPE_VALUE,
        label: t('mode.general'),
        description: t('scope.generalDescription'),
        searchText: `${t('mode.general')} ${t('scope.generalDescription')}`.toLocaleLowerCase(),
      },
      ...knowledgeBases.map((knowledgeBase) => ({
        value: knowledgeBase.id,
        label: knowledgeBase.name,
        description:
          knowledgeBase.description?.trim() ||
          t('scope.knowledgeBaseDocumentCount', { count: knowledgeBase.documentCount }),
        searchText: [
          knowledgeBase.name,
          knowledgeBase.description ?? '',
          knowledgeBase.embeddingProvider,
        ]
          .join(' ')
          .toLocaleLowerCase(),
      })),
    ],
    [knowledgeBases, t]
  );

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchInput.trim().toLocaleLowerCase();
    if (!normalizedSearch) {
      return options;
    }

    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(normalizedSearch) ||
        option.description.toLocaleLowerCase().includes(normalizedSearch) ||
        option.searchText.includes(normalizedSearch)
    );
  }, [options, searchInput]);

  const selectedValue = value ?? GENERAL_SCOPE_VALUE;
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? options[0] ?? null;
  const displayValue = searchInput || selectedOption?.label || '';

  return (
    <Combobox
      value={selectedValue}
      onValueChange={(nextValue) => {
        if (!nextValue) return;
        onValueChange(nextValue === GENERAL_SCOPE_VALUE ? null : nextValue);
        setSearchInput('');
      }}
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setSearchInput('');
        }
      }}
      disabled={disabled}
    >
      <ComboboxInput
        id="chat-knowledge-scope"
        value={displayValue}
        placeholder={t('scope.searchPlaceholder')}
        onChange={(event) => {
          setSearchInput(event.target.value);
          if (!open) {
            setOpen(true);
          }
        }}
        disabled={disabled}
        showTrigger
        className={CHAT_SELECTOR_INPUT_CLASSNAME}
      />
      <ComboboxContent className="p-0">
        <ComboboxList>
          {filteredOptions.map((option) => {
            const isGeneral = option.value === GENERAL_SCOPE_VALUE;
            const Icon = isGeneral ? MessageSquareText : Database;

            return (
              <ComboboxItem key={option.value} value={option.value}>
                <Icon className="size-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
        <ComboboxEmpty>{t('scope.noKnowledgeBaseMatch')}</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

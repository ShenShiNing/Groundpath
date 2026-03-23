import { useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem } from '@groundpath/shared/types';
import { CHAT_SELECTOR_INPUT_CLASSNAME } from './chatSelectorStyles';

// ============================================================================
// Types
// ============================================================================

export interface DocumentScopeSelectorProps {
  documents: DocumentListItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DocumentScopeSelector({
  documents,
  selectedIds,
  onChange,
  className,
}: DocumentScopeSelectorProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const isAllSelected = selectedIds.length === 0;
  const selectedCount = selectedIds.length;
  const selectedValueIds = selectedIds.filter((id) =>
    documents.some((document) => document.id === id)
  );

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleClearSelection = () => {
    onChange([]);
  };

  const getSelectedDocumentNames = () => {
    if (isAllSelected) return [];
    return documents.filter((doc) => selectedIds.includes(doc.id)).map((doc) => doc.title);
  };

  const buttonLabel = isAllSelected
    ? t('scope.allDocuments')
    : t('scope.selectedDocuments', { count: selectedCount });
  const filteredDocuments = documents.filter((document) =>
    document.title.toLocaleLowerCase().includes(searchInput.trim().toLocaleLowerCase())
  );

  return (
    <div
      className={cn(
        'flex w-full flex-col items-stretch gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2',
        className
      )}
    >
      <Combobox
        multiple
        value={selectedValueIds}
        onValueChange={(nextValue) => {
          const normalizedIds = nextValue.filter((id) =>
            documents.some((document) => document.id === id)
          );

          if (normalizedIds.length === 0 || normalizedIds.length === documents.length) {
            onChange([]);
            return;
          }

          onChange(normalizedIds);
        }}
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setSearchInput('');
          }
        }}
      >
        <ComboboxInput
          id="chat-document-scope"
          value={searchInput || buttonLabel}
          placeholder={t('scope.searchDocumentsPlaceholder')}
          onChange={(event) => {
            setSearchInput(event.target.value);
            if (!open) {
              setOpen(true);
            }
          }}
          showTrigger
          className={CHAT_SELECTOR_INPUT_CLASSNAME}
        />
        <ComboboxContent className="p-0">
          <div className="border-b p-1">
            <button
              type="button"
              className="data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={handleSelectAll}
            >
              <FileText className="size-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate">{t('scope.allDocuments')}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t('scope.allDocumentsDescription', { count: documents.length })}
                </span>
              </div>
              {isAllSelected ? (
                <span className="absolute right-2 flex size-4 items-center justify-center">
                  <Check className="size-4" />
                </span>
              ) : null}
            </button>
          </div>
          <ComboboxList>
            {filteredDocuments.map((document) => (
              <ComboboxItem key={document.id} value={document.id}>
                <FileText className="size-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{document.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {document.fileName}
                  </span>
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>{t('scope.noDocumentMatch')}</ComboboxEmpty>

          {selectedCount > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-center text-xs"
                onClick={handleClearSelection}
              >
                <X className="mr-1 size-3" />
                {t('scope.clearSelection')}
              </Button>
            </div>
          )}
        </ComboboxContent>
      </Combobox>

      {/* Selected Document Badges (optional) */}
      {!isAllSelected && selectedCount <= 2 && (
        <div className="hidden items-center gap-1 overflow-hidden md:flex">
          {getSelectedDocumentNames().map((name) => (
            <Badge key={name} variant="secondary" className="text-[10px] truncate max-w-25">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

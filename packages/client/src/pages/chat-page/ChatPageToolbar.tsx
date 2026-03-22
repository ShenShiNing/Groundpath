import { Link } from '@tanstack/react-router';
import { Database, Ellipsis, FileText, Sparkles, Trash2, Upload } from 'lucide-react';
import type { DocumentListItem, KnowledgeBaseListItem } from '@groundpath/shared/types';
import { ChatKnowledgeScopeCombobox, DocumentScopeSelector } from '@/components/chat';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export interface ChatPageToolbarProps {
  knowledgeBases: KnowledgeBaseListItem[];
  selectedKnowledgeBaseId: string | null;
  searchableDocuments: DocumentListItem[];
  selectedDocumentIds: string[];
  docsLoading: boolean;
  processingDocumentCount: number;
  hasPersistableMessages: boolean;
  messageCount: number;
  isGenerating: boolean;
  onKnowledgeBaseChange: (knowledgeBaseId: string | null) => void;
  onDocumentScopeChange: (ids: string[]) => void;
  onNewConversation: () => void;
  onOpenUploadDialog: () => void;
  onOpenSaveToKbDialog: () => void;
  onClearChat: () => void;
}

export function ChatPageToolbar({
  knowledgeBases,
  selectedKnowledgeBaseId,
  searchableDocuments,
  selectedDocumentIds,
  docsLoading,
  processingDocumentCount,
  hasPersistableMessages,
  messageCount,
  isGenerating,
  onKnowledgeBaseChange,
  onDocumentScopeChange,
  onNewConversation,
  onOpenUploadDialog,
  onOpenSaveToKbDialog,
  onClearChat,
}: ChatPageToolbarProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
      <ChatKnowledgeScopeCombobox
        knowledgeBases={knowledgeBases}
        value={selectedKnowledgeBaseId}
        disabled={isGenerating}
        onValueChange={onKnowledgeBaseChange}
      />

      {selectedKnowledgeBaseId ? (
        <DocumentScopeSelector
          documents={searchableDocuments}
          selectedIds={selectedDocumentIds}
          onChange={onDocumentScopeChange}
        />
      ) : (
        <span className="text-xs text-muted-foreground">{t('mode.general')}</span>
      )}

      <span
        className={`text-xs ${
          selectedKnowledgeBaseId && searchableDocuments.length === 0
            ? 'text-amber-600'
            : 'text-muted-foreground'
        }`}
      >
        {!selectedKnowledgeBaseId
          ? t('mode.generalNoLimit')
          : docsLoading
            ? t('documents.loading')
            : processingDocumentCount > 0
              ? t('documents.searchableWithProcessing', {
                  searchable: searchableDocuments.length,
                  processing: processingDocumentCount,
                })
              : t('documents.searchableOnly', {
                  searchable: searchableDocuments.length,
                })}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8 cursor-pointer"
            title={t('actions.title')}
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="cursor-pointer" onClick={onNewConversation}>
            <Sparkles className="size-4" />
            {t('actions.newConversation')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={onOpenUploadDialog}
            disabled={!selectedKnowledgeBaseId}
          >
            <Upload className="size-4" />
            {t('actions.uploadFile')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={onOpenSaveToKbDialog}
            disabled={!hasPersistableMessages}
          >
            <Database className="size-4" />
            {t('actions.seedKnowledgeBase')}
          </DropdownMenuItem>
          {selectedKnowledgeBaseId && (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/knowledge-bases/$id" params={{ id: selectedKnowledgeBaseId }}>
                <FileText className="size-4" />
                {t('actions.viewKnowledgeBaseDetail')}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onClick={onClearChat}
            disabled={messageCount === 0}
          >
            <Trash2 className="size-4" />
            {t('actions.clearChat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

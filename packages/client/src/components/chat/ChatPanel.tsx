import { useRef, useEffect, useState, useCallback } from 'react';
import { X, MessageSquare, Sparkles, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { CitationPreview } from './CitationPreview';
import { DocumentScopeSelector } from './DocumentScopeSelector';
import { ConversationList } from './ConversationList';
import { useChatPanelStore, type Citation } from '@/stores';
import { useAuthStore } from '@/stores';
import type { DocumentListItem } from '@knowledge-agent/shared/types';
import { copyMessageToClipboard, type CopyFormat } from '@/lib/chat';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface ChatPanelProps {
  knowledgeBaseId: string;
  documents: DocumentListItem[];
  onOpenDocument?: (documentId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ChatPanel({ knowledgeBaseId, documents, onOpenDocument }: ChatPanelProps) {
  const { t } = useTranslation('chat');
  const isOpen = useChatPanelStore((s) => s.isOpen);
  const messages = useChatPanelStore((s) => s.messages);
  const isLoading = useChatPanelStore((s) => s.isLoading);
  const selectedDocumentIds = useChatPanelStore((s) => s.selectedDocumentIds);
  const conversationId = useChatPanelStore((s) => s.conversationId);
  const showSidebar = useChatPanelStore((s) => s.showSidebar);
  const close = useChatPanelStore((s) => s.close);
  const sendMessage = useChatPanelStore((s) => s.sendMessage);
  const retryMessage = useChatPanelStore((s) => s.retryMessage);
  const stopGeneration = useChatPanelStore((s) => s.stopGeneration);
  const setDocumentScope = useChatPanelStore((s) => s.setDocumentScope);
  const clearMessages = useChatPanelStore((s) => s.clearMessages);
  const toggleSidebar = useChatPanelStore((s) => s.toggleSidebar);
  const startNewConversation = useChatPanelStore((s) => s.startNewConversation);
  const switchConversation = useChatPanelStore((s) => s.switchConversation);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Get access token getter
  const getAccessToken = useCallback(() => useAuthStore.getState().accessToken, []);

  // Handler for sending messages
  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessage(content, getAccessToken);
    },
    [sendMessage, getAccessToken]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      void retryMessage(messageId, getAccessToken);
    },
    [getAccessToken, retryMessage]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCitationClick = (citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  };

  const handleCopyMessage = async (content: string, format: CopyFormat) => {
    try {
      await copyMessageToClipboard(content, format);
      toast.success(format === 'plain' ? t('copy.plain.success') : t('copy.markdown.success'));
    } catch {
      toast.error(t('copy.error'));
    }
  };

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full z-50',
          'bg-background border-l shadow-xl',
          'flex flex-col',
          'transition-all duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          showSidebar ? 'w-150' : 'w-100'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSidebar}
              title={
                showSidebar
                  ? t('panel.toggle.hideConversations')
                  : t('panel.toggle.showConversations')
              }
            >
              {showSidebar ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeft className="size-4" />
              )}
            </Button>
            <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
              <MessageSquare className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('panel.title')}</h3>
              <p className="text-[10px] text-muted-foreground">{t('panel.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearMessages}
                title={t('actions.clearChat')}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={close}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Main content with optional sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          {showSidebar && (
            <div className="w-50 h-full border-r shrink-0">
              <ConversationList
                knowledgeBaseId={knowledgeBaseId}
                currentConversationId={conversationId}
                onSelect={switchConversation}
                onNewConversation={startNewConversation}
              />
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            {/* Document Scope */}
            <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
              <DocumentScopeSelector
                documents={documents}
                selectedIds={selectedDocumentIds}
                onChange={setDocumentScope}
              />
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full py-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-3 opacity-60 px-4">
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="size-6 text-primary" />
                    </div>
                    <h4 className="text-sm font-medium">{t('panel.empty.title')}</h4>
                    <p className="text-xs text-muted-foreground max-w-65">
                      {t('panel.empty.description')}
                    </p>
                  </div>
                ) : (
                  <div className="pl-4 pr-5 w-full">
                    {messages.map((message) => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        onCitationClick={handleCitationClick}
                        onCopy={(format) => handleCopyMessage(message.content, format)}
                        onRegenerate={
                          message.role === 'assistant' && !message.isLoading
                            ? () => handleRetry(message.id)
                            : undefined
                        }
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Input */}
            <div className="shrink-0">
              <ChatInput
                onSend={handleSendMessage}
                onStop={stopGeneration}
                isGenerating={isLoading}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={close} />}

      {/* Citation Preview Dialog */}
      <CitationPreview
        citation={previewCitation}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onOpenDocument={onOpenDocument}
      />
    </>
  );
}

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  X,
  MessageSquare,
  Sparkles,
  Trash2,
  StopCircle,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { CitationPreview } from './CitationPreview';
import { DocumentScopeSelector } from './DocumentScopeSelector';
import { ConversationList } from './ConversationList';
import { useChatPanelStore, type Citation } from '@/stores/chatPanelStore';
import { useAuthStore } from '@/stores/authStore';
import type { DocumentListItem } from '@knowledge-agent/shared/types';

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
  const {
    isOpen,
    messages,
    isLoading,
    selectedDocumentIds,
    conversationId,
    showSidebar,
    close,
    sendMessage,
    stopGeneration,
    setDocumentScope,
    clearMessages,
    toggleSidebar,
    startNewConversation,
    switchConversation,
  } = useChatPanelStore();

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCitationClick = (citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
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
              title={showSidebar ? 'Hide conversations' : 'Show conversations'}
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
              <h3 className="text-sm font-semibold">AI Chat</h3>
              <p className="text-[10px] text-muted-foreground">
                Ask questions about your documents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isLoading && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={stopGeneration}
                title="Stop generation"
              >
                <StopCircle className="size-4 text-destructive" />
              </Button>
            )}
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearMessages}
                title="Clear chat"
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
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {showSidebar && (
            <div className="w-50 h-full border-r flex-shrink-0">
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
              <ScrollArea className="h-full px-4 py-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-3 opacity-60">
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="size-6 text-primary" />
                    </div>
                    <h4 className="text-sm font-medium">Start a conversation</h4>
                    <p className="text-xs text-muted-foreground max-w-65">
                      Ask questions about the documents in your knowledge base. I'll provide answers
                      with source citations.
                    </p>
                  </div>
                ) : (
                  <div>
                    {messages.map((message) => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        onCitationClick={handleCitationClick}
                        onCopy={() => handleCopyMessage(message.content)}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Input */}
            <div className="shrink-0">
              <ChatInput onSend={handleSendMessage} disabled={isLoading} />
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

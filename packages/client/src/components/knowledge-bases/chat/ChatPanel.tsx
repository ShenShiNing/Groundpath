import { useRef, useEffect, useState } from 'react';
import { X, MessageSquare, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { CitationPreview } from './CitationPreview';
import { DocumentScopeSelector } from './DocumentScopeSelector';
import { useChatPanelStore, type Citation } from '@/stores/chatPanelStore';
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

export function ChatPanel({ documents, onOpenDocument }: ChatPanelProps) {
  const {
    isOpen,
    messages,
    isLoading,
    selectedDocumentIds,
    close,
    sendMessage,
    setDocumentScope,
    clearMessages,
  } = useChatPanelStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
          'fixed top-0 right-0 h-full w-100 z-50',
          'bg-background border-l shadow-xl',
          'flex flex-col',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
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

        {/* Document Scope */}
        <div className="px-4 py-2 border-b bg-muted/30">
          <DocumentScopeSelector
            documents={documents}
            selectedIds={selectedDocumentIds}
            onChange={setDocumentScope}
          />
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-3 opacity-60">
              <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-6 text-primary" />
              </div>
              <h4 className="text-sm font-medium">Start a conversation</h4>
              <p className="text-xs text-muted-foreground max-w-65">
                Ask questions about the documents in your knowledge base. I'll provide answers with
                source citations.
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

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isLoading} />
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

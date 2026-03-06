import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Database, Ellipsis, FileText, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChatInput, ChatMessage, CitationPreview, DocumentScopeSelector } from '@/components/chat';
import { copyMessageToClipboard, type CopyFormat } from '@/lib/chat';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { knowledgeBasesApi } from '@/api';
import { useCreateKnowledgeBase, useKBDocuments, useKnowledgeBases } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useChatPanelStore, type Citation } from '@/stores';
import { toast } from 'sonner';

type KnowledgeSeedSource = 'conversation' | 'latest-assistant';

function sanitizeFileName(input: string): string {
  const invalidChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  const sanitized = input
    .trim()
    .split('')
    .map((char) => {
      const codePoint = char.charCodeAt(0);
      if (codePoint <= 31 || invalidChars.has(char)) {
        return '_';
      }
      return char;
    })
    .join('');

  return input ? sanitized.replace(/\s+/g, '-').slice(0, 80) : '';
}

function buildConversationMarkdown(
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
  labels: {
    transcript: string;
    user: string;
    assistant: string;
  }
): string {
  const body = messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      const title = message.role === 'user' ? labels.user : labels.assistant;
      const time = message.timestamp.toISOString();
      return `## ${title} (${time})\n\n${message.content.trim()}\n`;
    })
    .join('\n');

  return `# ${labels.transcript}\n\n${body}`.trim();
}

function findFirstMatchingTextElement(container: HTMLElement, keyword: string): HTMLElement | null {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  if (!normalizedKeyword) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_SKIP;
      return text.toLocaleLowerCase().includes(normalizedKeyword)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  const firstMatch = walker.nextNode();
  return firstMatch instanceof Text ? firstMatch.parentElement : null;
}

export function ChatPage() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScrollRef = useRef(false);

  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | undefined>(
    useChatPanelStore.getState().knowledgeBaseId ?? undefined
  );
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createKbDialogOpen, setCreateKbDialogOpen] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDescription, setNewKbDescription] = useState('');
  const [newKbEmbeddingProvider, setNewKbEmbeddingProvider] =
    useState<EmbeddingProviderType>('zhipu');
  const [seedSource, setSeedSource] = useState<KnowledgeSeedSource>('conversation');
  const [switchToNewKb, setSwitchToNewKb] = useState(true);
  const [isCreatingKb, setIsCreatingKb] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const { data: knowledgeBases = [], isLoading: kbLoading } = useKnowledgeBases();
  const createKnowledgeBase = useCreateKnowledgeBase();
  const { data: documentsResponse, isLoading: docsLoading } = useKBDocuments(
    selectedKnowledgeBaseId,
    {
      pageSize: 100,
    }
  );

  const knowledgeBaseId = useChatPanelStore((s) => s.knowledgeBaseId);
  const conversationId = useChatPanelStore((s) => s.conversationId);
  const messages = useChatPanelStore((s) => s.messages);
  const focusMessageId = useChatPanelStore((s) => s.focusMessageId);
  const focusKeyword = useChatPanelStore((s) => s.focusKeyword);
  const selectedDocumentIds = useChatPanelStore((s) => s.selectedDocumentIds);
  const isLoading = useChatPanelStore((s) => s.isLoading);
  const open = useChatPanelStore((s) => s.open);
  const sendMessage = useChatPanelStore((s) => s.sendMessage);
  const retryMessage = useChatPanelStore((s) => s.retryMessage);
  const stopGeneration = useChatPanelStore((s) => s.stopGeneration);
  const setDocumentScope = useChatPanelStore((s) => s.setDocumentScope);
  const clearMessages = useChatPanelStore((s) => s.clearMessages);
  const startNewConversation = useChatPanelStore((s) => s.startNewConversation);
  const clearFocusMessageId = useChatPanelStore((s) => s.clearFocusMessageId);

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);
  const searchableDocuments = useMemo(
    () => documents.filter((doc) => doc.processingStatus === 'completed'),
    [documents]
  );
  const processingDocumentCount = useMemo(
    () =>
      documents.filter(
        (doc) => doc.processingStatus === 'pending' || doc.processingStatus === 'processing'
      ).length,
    [documents]
  );
  const preferredKnowledgeBaseId = useMemo(() => {
    if (knowledgeBases.length === 0) return undefined;

    const sortedByUpdated = [...knowledgeBases].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sortedByUpdated.find((kb) => kb.documentCount > 0)?.id ?? sortedByUpdated[0]!.id;
  }, [knowledgeBases]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId),
    [knowledgeBases, selectedKnowledgeBaseId]
  );
  const assistantMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === 'assistant' && !message.isLoading && message.content.trim().length > 0
      ),
    [messages]
  );
  const latestAssistantMessage = useMemo(
    () => assistantMessages[assistantMessages.length - 1] ?? null,
    [assistantMessages]
  );
  const hasPersistableMessages = useMemo(
    () => messages.some((message) => !message.isLoading && message.content.trim().length > 0),
    [messages]
  );

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setSelectedKnowledgeBaseId(undefined);
      return;
    }

    if (
      !selectedKnowledgeBaseId ||
      !knowledgeBases.some((kb) => kb.id === selectedKnowledgeBaseId)
    ) {
      // If the store agrees with our selection, the KB was explicitly set
      // (e.g. newly created) but the query cache hasn't refreshed yet — don't override
      if (selectedKnowledgeBaseId && selectedKnowledgeBaseId === knowledgeBaseId) {
        return;
      }
      setSelectedKnowledgeBaseId(preferredKnowledgeBaseId);
    }
  }, [knowledgeBases, knowledgeBaseId, preferredKnowledgeBaseId, selectedKnowledgeBaseId]);

  // Keep local selected KB in sync when conversation is switched from outside ChatPage (e.g. sidebar)
  useEffect(() => {
    if (!conversationId) return;
    if (knowledgeBaseId !== (selectedKnowledgeBaseId ?? null)) {
      setSelectedKnowledgeBaseId(knowledgeBaseId ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when store values change, not when local state does
  }, [conversationId, knowledgeBaseId]);

  useEffect(() => {
    const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
    // Avoid overriding externally-loaded conversation context
    if (conversationId && targetKnowledgeBaseId !== knowledgeBaseId) {
      return;
    }
    if (targetKnowledgeBaseId !== knowledgeBaseId) {
      open(targetKnowledgeBaseId);
    }
  }, [conversationId, knowledgeBaseId, open, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (selectedDocumentIds.length === 0) return;
    const searchableIds = new Set(searchableDocuments.map((doc) => doc.id));
    const nextSelected = selectedDocumentIds.filter((id) => searchableIds.has(id));
    if (nextSelected.length !== selectedDocumentIds.length) {
      setDocumentScope(nextSelected);
    }
  }, [searchableDocuments, selectedDocumentIds, setDocumentScope]);

  useEffect(() => {
    if (focusMessageId || skipNextAutoScrollRef.current) {
      if (skipNextAutoScrollRef.current) {
        skipNextAutoScrollRef.current = false;
      }
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [focusMessageId, messages]);

  useEffect(() => {
    if (!focusMessageId || messages.length === 0) return;

    const targetElement = document.getElementById(`chat-message-${focusMessageId}`);
    if (!targetElement) {
      clearFocusMessageId();
      return;
    }

    const keywordTarget = focusKeyword
      ? findFirstMatchingTextElement(targetElement, focusKeyword)
      : null;

    if (keywordTarget) {
      keywordTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } else {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setHighlightedMessageId(focusMessageId);
    skipNextAutoScrollRef.current = true;
    clearFocusMessageId();

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === focusMessageId ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearFocusMessageId, focusKeyword, focusMessageId, messages]);

  const getAccessToken = useCallback(() => useAuthStore.getState().accessToken, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
      if (knowledgeBaseId !== targetKnowledgeBaseId) {
        open(targetKnowledgeBaseId);
      }
      void sendMessage(content, getAccessToken);
    },
    [getAccessToken, knowledgeBaseId, open, selectedKnowledgeBaseId, sendMessage]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      void retryMessage(messageId, getAccessToken);
    },
    [getAccessToken, retryMessage]
  );

  const handleCitationClick = useCallback((citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  }, []);

  const handleCopyMessage = useCallback(
    async (content: string, format: CopyFormat) => {
      try {
        await copyMessageToClipboard(content, format);
        toast.success(format === 'plain' ? t('copy.plain.success') : t('copy.markdown.success'));
      } catch {
        toast.error(t('copy.error'));
      }
    },
    [t]
  );

  const handleOpenDocumentFromCitation = useCallback(
    (documentId: string) => {
      void navigate({
        to: '/documents/$id',
        params: { id: documentId },
      });
    },
    [navigate]
  );

  const handleUploadSuccess = useCallback(() => {
    setUploadDialogOpen(false);
  }, []);

  const handleOpenCreateKbDialog = useCallback(() => {
    if (!hasPersistableMessages) {
      toast.info(t('kbSeed.none'));
      return;
    }

    const defaultName = selectedKnowledgeBase?.name ?? t('kb.defaultName');
    setNewKbName(defaultName);
    setNewKbDescription('');
    setNewKbEmbeddingProvider('zhipu');
    setSeedSource(latestAssistantMessage ? 'latest-assistant' : 'conversation');
    setSwitchToNewKb(true);
    setCreateKbDialogOpen(true);
  }, [hasPersistableMessages, latestAssistantMessage, selectedKnowledgeBase?.name, t]);

  const handleCreateKbFromChat = useCallback(async () => {
    if (!newKbName.trim()) {
      toast.error(t('kbName.required'));
      return;
    }

    if (seedSource === 'latest-assistant' && !latestAssistantMessage) {
      toast.error(t('latestAssistant.none'));
      return;
    }

    const conversationContent = buildConversationMarkdown(
      messages
        .filter((message) => !message.isLoading)
        .map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
        })),
      {
        transcript: t('export.transcriptTitle'),
        user: t('export.user'),
        assistant: t('export.assistant'),
      }
    );
    const latestAssistantContent = latestAssistantMessage?.content.trim() ?? '';
    const selectedContent =
      seedSource === 'latest-assistant' ? latestAssistantContent : conversationContent;

    if (!selectedContent.trim()) {
      toast.error(t('content.empty'));
      return;
    }

    setIsCreatingKb(true);
    try {
      const knowledgeBase = await createKnowledgeBase.mutateAsync({
        name: newKbName.trim(),
        description: newKbDescription.trim() || null,
        embeddingProvider: newKbEmbeddingProvider,
      });

      const documentTitle =
        seedSource === 'latest-assistant'
          ? t('seed.documentTitle.latestAssistant')
          : t('seed.documentTitle.transcript');
      const fileBaseName = sanitizeFileName(documentTitle || knowledgeBase.name) || 'chat-notes';
      const file = new File([selectedContent], `${fileBaseName}.md`, {
        type: 'text/markdown',
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', documentTitle);
      formData.append('description', t('seed.documentDescription'));

      await knowledgeBasesApi.uploadDocument(knowledgeBase.id, formData);

      if (switchToNewKb) {
        setSelectedKnowledgeBaseId(knowledgeBase.id);
        open(knowledgeBase.id);
        startNewConversation();
      }

      setCreateKbDialogOpen(false);
      toast.success(t('kbCreate.success'));
    } catch {
      toast.error(t('kbCreate.error'));
    } finally {
      setIsCreatingKb(false);
    }
  }, [
    createKnowledgeBase,
    latestAssistantMessage,
    messages,
    newKbDescription,
    newKbEmbeddingProvider,
    newKbName,
    open,
    seedSource,
    startNewConversation,
    switchToNewKb,
    t,
  ]);

  if (kbLoading) {
    return (
      <>
        <div className="flex-1 overflow-hidden bg-background px-6 py-8">
          <div className="flex h-full flex-col gap-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-112 rounded-2xl" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t('skipToContent')}
      </a>

      <div className="flex-1 overflow-hidden bg-background">
        <div className="flex h-full w-full flex-col">
          <section id="chat-main" className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-full min-h-88 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
                {selectedKnowledgeBaseId ? (
                  <DocumentScopeSelector
                    documents={searchableDocuments}
                    selectedIds={selectedDocumentIds}
                    onChange={setDocumentScope}
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
                    <DropdownMenuItem className="cursor-pointer" onClick={startNewConversation}>
                      <Sparkles className="size-4" />
                      {t('actions.newConversation')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setUploadDialogOpen(true)}
                      disabled={!selectedKnowledgeBaseId}
                    >
                      <Upload className="size-4" />
                      {t('actions.uploadFile')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={handleOpenCreateKbDialog}
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
                      onClick={clearMessages}
                      disabled={messages.length === 0}
                    >
                      <Trash2 className="size-4" />
                      {t('actions.clearChat')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-h-0 flex-1">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 py-8 md:px-6">
                    <div className="mx-auto flex max-w-lg flex-col items-center text-center">
                      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                        <Sparkles className="size-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
                      <p className="mt-2 max-w-md text-sm text-muted-foreground">
                        {selectedKnowledgeBaseId ? t('empty.withKb') : t('empty.general')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          id={`chat-message-${message.id}`}
                          className={cn(
                            'scroll-mt-24 rounded-lg transition-colors duration-700',
                            highlightedMessageId === message.id
                              ? 'bg-transparent ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
                              : 'bg-transparent'
                          )}
                        >
                          <ChatMessage
                            message={message}
                            onCitationClick={handleCitationClick}
                            onCopy={(format) => handleCopyMessage(message.content, format)}
                            onRegenerate={
                              message.role === 'assistant' && !message.isLoading
                                ? () => handleRetry(message.id)
                                : undefined
                            }
                          />
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="shrink-0 bg-background pb-4 pt-2 md:pb-6">
                <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
                  <ChatInput
                    onSend={handleSendMessage}
                    onStop={stopGeneration}
                    isGenerating={isLoading}
                    disabled={isLoading}
                    placeholder={
                      selectedKnowledgeBaseId
                        ? t('input.placeholder.withKb')
                        : t('input.placeholder.general')
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={createKbDialogOpen} onOpenChange={setCreateKbDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('createKb.title')}</DialogTitle>
            <DialogDescription>{t('createKb.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="chat-kb-name">{t('createKb.name')}</Label>
              <Input
                id="chat-kb-name"
                value={newKbName}
                onChange={(event) => setNewKbName(event.target.value)}
                placeholder={t('createKb.namePlaceholder')}
                maxLength={200}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-kb-description">{t('createKb.descriptionLabel')}</Label>
              <Textarea
                id="chat-kb-description"
                value={newKbDescription}
                onChange={(event) => setNewKbDescription(event.target.value)}
                placeholder={t('createKb.descriptionPlaceholder')}
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-kb-provider">{t('createKb.provider')}</Label>
              <Select
                value={newKbEmbeddingProvider}
                onValueChange={(value) => setNewKbEmbeddingProvider(value as EmbeddingProviderType)}
              >
                <SelectTrigger id="chat-kb-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zhipu">Zhipu AI</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-seed-source">{t('createKb.seedSource')}</Label>
              <Select
                value={seedSource}
                onValueChange={(value) => setSeedSource(value as KnowledgeSeedSource)}
              >
                <SelectTrigger id="chat-seed-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation">
                    {t('createKb.seedSourceConversation')}
                  </SelectItem>
                  <SelectItem value="latest-assistant" disabled={!latestAssistantMessage}>
                    {t('createKb.seedSourceLatestAssistant')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {seedSource === 'latest-assistant' && !latestAssistantMessage && (
                <p className="text-xs text-amber-600">
                  {t('createKb.seedSourceLatestAssistantEmpty')}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="switch-to-new-kb"
                checked={switchToNewKb}
                onCheckedChange={(checked) => setSwitchToNewKb(checked === true)}
              />
              <Label htmlFor="switch-to-new-kb" className="text-sm">
                {t('createKb.switchToNewKb')}
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateKbDialogOpen(false)}>
              {t('createKb.cancel')}
            </Button>
            <Button onClick={() => void handleCreateKbFromChat()} disabled={isCreatingKb}>
              {isCreatingKb ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  {t('createKb.creating')}
                </>
              ) : (
                t('createKb.submit')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('upload.title')}</DialogTitle>
            <DialogDescription>{t('upload.description')}</DialogDescription>
          </DialogHeader>
          <DocumentUpload
            knowledgeBaseId={selectedKnowledgeBaseId}
            onSuccess={handleUploadSuccess}
          />
        </DialogContent>
      </Dialog>

      <CitationPreview
        citation={previewCitation}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onOpenDocument={handleOpenDocumentFromCitation}
      />
    </>
  );
}

export default ChatPage;

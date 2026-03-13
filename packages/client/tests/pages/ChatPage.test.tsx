import React, { useState } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatPanelState, ChatMessage as StoreChatMessage } from '@/stores';
import type { Citation } from '@/stores/chatPanelStore.types';
import type { DocumentListItem, KnowledgeBaseListItem } from '@knowledge-agent/shared/types';
import ChatPage from '@/pages/ChatPage';
import { useChatPanelStore } from '@/stores';
import { fireClick, fireInput, flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  useKnowledgeBases: vi.fn(),
  useKBDocuments: vi.fn(),
  navigate: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  copyMessageToClipboard: vi.fn(),
  scrollIntoView: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useKnowledgeBases: mocks.useKnowledgeBases,
  useKBDocuments: mocks.useKBDocuments,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/lib/chat', () => ({
  copyMessageToClipboard: mocks.copyMessageToClipboard,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, props);
    }

    return <button {...props}>{children}</button>;
  },
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    asChild,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...props,
        onClick,
        'aria-disabled': disabled,
      });
    }

    return (
      <button type="button" disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>
      <div data-slot="scroll-area-viewport">{children}</div>
    </div>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-skeleton={className} />,
}));

vi.mock('@/components/chat', () => ({
  ChatInput: ({
    onSend,
    onStop,
    placeholder,
    isGenerating,
  }: {
    onSend: (value: string) => void;
    onStop: () => void;
    placeholder?: string;
    isGenerating?: boolean;
  }) => {
    const [value, setValue] = useState('');

    return (
      <div>
        <input
          value={value}
          placeholder={placeholder}
          onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          onChange={(event) => setValue((event.target as HTMLInputElement).value)}
        />
        <button type="button" onClick={() => onSend(value)}>
          send-message
        </button>
        {isGenerating ? (
          <button type="button" onClick={onStop}>
            stop-generation
          </button>
        ) : null}
      </div>
    );
  },
  ChatMessage: ({
    message,
    canEdit,
    canRegenerate,
    onCitationClick,
    onCopyMessage,
    onEditMessage,
    onRegenerateMessage,
  }: {
    message: StoreChatMessage;
    canEdit?: boolean;
    canRegenerate?: boolean;
    onCitationClick: (citation: Citation) => void;
    onCopyMessage: (content: string, format: 'plain' | 'markdown') => void;
    onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
    onRegenerateMessage?: (messageId: string) => void;
  }) => (
    <article>
      <p>{message.content}</p>
      <button type="button" onClick={() => onCopyMessage(message.content, 'plain')}>
        copy-message
      </button>
      {canEdit && onEditMessage ? (
        <button type="button" onClick={() => onEditMessage(message.id, `edited:${message.id}`)}>
          edit-message
        </button>
      ) : null}
      {message.citations?.[0] ? (
        <button type="button" onClick={() => onCitationClick(message.citations![0]!)}>
          open-citation
        </button>
      ) : null}
      {canRegenerate && onRegenerateMessage ? (
        <button type="button" onClick={() => onRegenerateMessage(message.id)}>
          regenerate-message
        </button>
      ) : null}
    </article>
  ),
  CitationPreview: ({
    citation,
    open,
    onOpenChange,
    onOpenDocument,
  }: {
    citation: Citation | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenDocument: (documentId: string) => void;
  }) =>
    open ? (
      <div data-testid="citation-preview">
        <span>{citation?.documentTitle}</span>
        <button
          type="button"
          onClick={() => citation?.documentId && onOpenDocument(citation.documentId)}
        >
          open-citation-document
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          close-citation-preview
        </button>
      </div>
    ) : null,
  DocumentScopeSelector: ({
    documents,
    selectedIds,
  }: {
    documents: DocumentListItem[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div data-testid="document-scope">
      docs:{documents.map((document) => document.title).join('|')} selected:{selectedIds.join('|')}
    </div>
  ),
}));

vi.mock('@/components/chat/SaveToKBDialog', () => ({
  SaveToKBDialog: ({
    open,
    selectedKnowledgeBaseId,
  }: {
    open: boolean;
    selectedKnowledgeBaseId?: string;
  }) => (open ? <div data-testid="save-to-kb-dialog">save:{selectedKnowledgeBaseId}</div> : null),
}));

vi.mock('@/components/documents/DocumentUpload', () => ({
  DocumentUpload: ({ onSuccess }: { onSuccess: () => void }) => (
    <div data-testid="document-upload">
      <button type="button" onClick={onSuccess}>
        finish-upload
      </button>
    </div>
  ),
}));

const baseChatState = useChatPanelStore.getState();

function resetChatStore(overrides: Partial<ChatPanelState> = {}) {
  useChatPanelStore.setState({
    ...baseChatState,
    isOpen: false,
    knowledgeBaseId: null,
    conversationId: null,
    focusMessageId: null,
    focusKeyword: null,
    messages: [],
    selectedDocumentIds: [],
    isLoading: false,
    abortController: null,
    showSidebar: false,
    ...overrides,
  });
}

function createKnowledgeBase(
  id: string,
  documentCount: number,
  updatedAt: string
): KnowledgeBaseListItem {
  return {
    id,
    name: `Knowledge Base ${id}`,
    description: null,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    documentCount,
    totalChunks: documentCount * 8,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date(updatedAt),
  };
}

function createDocument(
  id: string,
  title: string,
  processingStatus: DocumentListItem['processingStatus']
): DocumentListItem {
  return {
    id,
    title,
    description: null,
    fileName: `${id}.md`,
    fileSize: 128,
    fileExtension: 'md',
    documentType: 'markdown',
    processingStatus,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  };
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetChatStore();
    mocks.useKnowledgeBases.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    mocks.useKBDocuments.mockReturnValue({
      data: {
        documents: [],
      },
      isLoading: false,
      isError: false,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: mocks.scrollIntoView,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects the preferred knowledge base, sends messages, and closes the upload dialog after success', async () => {
    const knowledgeBases = [
      createKnowledgeBase('kb-empty', 0, '2026-03-10T00:00:00.000Z'),
      createKnowledgeBase('kb-ready', 2, '2026-03-11T00:00:00.000Z'),
    ];
    const documents = [
      createDocument('doc-ready', 'Ready Guide', 'completed'),
      createDocument('doc-processing', 'Processing Guide', 'processing'),
    ];

    const open = vi.fn((kbId?: string | null) => {
      useChatPanelStore.setState({ knowledgeBaseId: kbId ?? null });
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    resetChatStore({
      open,
      sendMessage,
      selectedDocumentIds: ['doc-ready', 'doc-processing'],
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: knowledgeBases,
      isLoading: false,
      isError: false,
    });
    mocks.useKBDocuments.mockImplementation((kbId?: string) => ({
      data: {
        documents: kbId === 'kb-ready' ? documents : [],
      },
      isLoading: false,
      isError: false,
    }));

    const view = await render(<ChatPage />);
    await flushPromises();

    expect(open).toHaveBeenCalledWith('kb-ready');

    const scope = view.container.querySelector('[data-testid="document-scope"]');
    expect(scope?.textContent).toContain('Ready Guide');
    expect(scope?.textContent).not.toContain('Processing Guide');

    const input = view.container.querySelector(
      'input[placeholder="input.placeholder.withKb"]'
    ) as HTMLInputElement | null;
    await fireInput(input, 'Explain the ready guide');

    const sendButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('send-message')
    );
    await fireClick(sendButton ?? null);

    expect(sendMessage).toHaveBeenCalledWith(
      'Explain the ready guide',
      expect.any(Function),
      expect.objectContaining({
        push: expect.any(Function),
        flush: expect.any(Function),
        reset: expect.any(Function),
      })
    );

    const uploadButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('actions.uploadFile')
    );
    await fireClick(uploadButton ?? null);

    expect(view.container.querySelector('[data-testid="document-upload"]')).not.toBeNull();

    const finishUploadButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('finish-upload')
    );
    await fireClick(finishUploadButton ?? null);
    await flushPromises();

    expect(view.container.querySelector('[data-testid="document-upload"]')).toBeNull();

    await view.unmount();
  });

  it('prunes invalid document scope, highlights focused messages, and navigates from citation preview', async () => {
    vi.useFakeTimers();

    const setDocumentScope = vi.fn();
    const citation: Citation = {
      id: 'cit-1',
      documentId: 'doc-ready',
      documentTitle: 'Ready Guide',
      excerpt: 'target keyword excerpt',
      sourceType: 'chunk',
      chunkIndex: 0,
      content: 'target keyword excerpt',
    };

    resetChatStore({
      knowledgeBaseId: 'kb-ready',
      selectedDocumentIds: ['doc-ready', 'doc-processing'],
      setDocumentScope,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'This message contains the target keyword for preview navigation.',
          timestamp: new Date('2026-03-12T00:00:00.000Z'),
          citations: [citation],
        },
      ],
      focusMessageId: 'assistant-1',
      focusKeyword: 'target keyword',
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase('kb-ready', 2, '2026-03-11T00:00:00.000Z')],
      isLoading: false,
      isError: false,
    });
    mocks.useKBDocuments.mockReturnValue({
      data: {
        documents: [
          createDocument('doc-ready', 'Ready Guide', 'completed'),
          createDocument('doc-processing', 'Processing Guide', 'processing'),
        ],
      },
      isLoading: false,
      isError: false,
    });

    const view = await render(<ChatPage />);
    await flushPromises();

    expect(setDocumentScope).toHaveBeenLastCalledWith(['doc-ready']);
    expect(mocks.scrollIntoView).toHaveBeenCalled();
    expect(useChatPanelStore.getState().focusMessageId).toBeNull();
    expect(useChatPanelStore.getState().focusKeyword).toBeNull();

    const highlightedMessage = view.container.querySelector('#chat-message-assistant-1');
    expect(highlightedMessage?.className).toContain('ring-2');

    const citationButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('open-citation')
    );
    await fireClick(citationButton ?? null);

    expect(view.container.querySelector('[data-testid="citation-preview"]')).not.toBeNull();

    const openDocumentButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('open-citation-document')
    );
    await fireClick(openDocumentButton ?? null);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/documents/$id',
      params: { id: 'doc-ready' },
    });

    await act(async () => {
      vi.advanceTimersByTime(2200);
      await Promise.resolve();
    });

    const highlightedMessageAfterTimeout = view.container.querySelector(
      '#chat-message-assistant-1'
    );
    expect(highlightedMessageAfterTimeout?.className).not.toContain('ring-2');

    await view.unmount();
  });

  it('routes user message edits through the chat store controller', async () => {
    const editMessage = vi.fn().mockImplementation(async (_messageId: string, content: string) => {
      useChatPanelStore.setState({
        isLoading: true,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content,
            timestamp: new Date('2026-03-13T10:00:00.000Z'),
          },
          {
            id: 'assistant-regenerated',
            role: 'assistant',
            content: '',
            timestamp: new Date('2026-03-13T10:00:01.000Z'),
            isLoading: true,
          },
        ],
      });
    });

    resetChatStore({
      knowledgeBaseId: 'kb-ready',
      editMessage,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Original question',
          timestamp: new Date('2026-03-13T10:00:00.000Z'),
        },
      ],
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase('kb-ready', 1, '2026-03-13T09:00:00.000Z')],
      isLoading: false,
      isError: false,
    });

    const view = await render(<ChatPage />);
    await flushPromises();

    const editButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('edit-message')
    );
    await fireClick(editButton ?? null);

    expect(editMessage).toHaveBeenCalledWith(
      'user-1',
      'edited:user-1',
      expect.any(Function),
      expect.objectContaining({
        push: expect.any(Function),
        flush: expect.any(Function),
        reset: expect.any(Function),
      })
    );

    await view.unmount();
  });

  it('scrolls the newest user message into view before the assistant starts filling the reply area', async () => {
    resetChatStore({
      knowledgeBaseId: 'kb-ready',
      messages: [
        {
          id: 'assistant-old',
          role: 'assistant',
          content: 'Earlier answer',
          timestamp: new Date('2026-03-13T09:58:00.000Z'),
        },
      ],
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase('kb-ready', 1, '2026-03-13T09:00:00.000Z')],
      isLoading: false,
      isError: false,
    });

    const view = await render(<ChatPage />);
    await flushPromises();

    mocks.scrollIntoView.mockClear();

    await act(async () => {
      useChatPanelStore.setState({
        isLoading: true,
        messages: [
          {
            id: 'assistant-old',
            role: 'assistant',
            content: 'Earlier answer',
            timestamp: new Date('2026-03-13T09:58:00.000Z'),
          },
          {
            id: 'user-new',
            role: 'user',
            content: 'Fresh question',
            timestamp: new Date('2026-03-13T10:00:00.000Z'),
          },
          {
            id: 'assistant-new',
            role: 'assistant',
            content: '',
            timestamp: new Date('2026-03-13T10:00:01.000Z'),
            isLoading: true,
          },
        ],
      });
    });
    await flushPromises();

    expect(mocks.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'end',
    });

    await view.unmount();
  });

  it('keeps auto-scrolling while streaming when the user stays near the bottom', async () => {
    resetChatStore({
      knowledgeBaseId: 'kb-ready',
      isLoading: true,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'First streamed answer',
          timestamp: new Date('2026-03-13T10:00:00.000Z'),
          isLoading: true,
        },
      ],
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase('kb-ready', 1, '2026-03-13T09:00:00.000Z')],
      isLoading: false,
      isError: false,
    });

    const view = await render(<ChatPage />);
    await flushPromises();

    const viewport = view.container.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;

    expect(viewport).not.toBeNull();

    Object.defineProperty(viewport!, 'scrollTop', {
      configurable: true,
      value: 160,
      writable: true,
    });
    Object.defineProperty(viewport!, 'clientHeight', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(viewport!, 'scrollHeight', {
      configurable: true,
      value: 400,
    });

    await act(async () => {
      viewport!.dispatchEvent(new Event('scroll'));
    });

    mocks.scrollIntoView.mockClear();

    await act(async () => {
      useChatPanelStore.setState({
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'First streamed answer with more content',
            timestamp: new Date('2026-03-13T10:00:00.000Z'),
            isLoading: true,
          },
        ],
      });
    });
    await flushPromises();

    expect(mocks.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'end',
    });

    await view.unmount();
  });

  it('stops auto-scrolling after the user scrolls away from the bottom', async () => {
    resetChatStore({
      knowledgeBaseId: 'kb-ready',
      isLoading: true,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'First streamed answer',
          timestamp: new Date('2026-03-13T10:00:00.000Z'),
          isLoading: true,
        },
      ],
    });

    mocks.useKnowledgeBases.mockReturnValue({
      data: [createKnowledgeBase('kb-ready', 1, '2026-03-13T09:00:00.000Z')],
      isLoading: false,
      isError: false,
    });

    const view = await render(<ChatPage />);
    await flushPromises();

    const viewport = view.container.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;

    expect(viewport).not.toBeNull();

    Object.defineProperty(viewport!, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(viewport!, 'clientHeight', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(viewport!, 'scrollHeight', {
      configurable: true,
      value: 400,
    });

    await act(async () => {
      viewport!.dispatchEvent(new Event('scroll'));
    });

    mocks.scrollIntoView.mockClear();

    await act(async () => {
      useChatPanelStore.setState({
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'First streamed answer with more content',
            timestamp: new Date('2026-03-13T10:00:00.000Z'),
            isLoading: true,
          },
        ],
      });
    });
    await flushPromises();

    expect(mocks.scrollIntoView).not.toHaveBeenCalled();

    await view.unmount();
  });
});

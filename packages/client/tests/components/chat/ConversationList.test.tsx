import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireClick, flushPromises } from '@tests/utils/render';

const mocks = vi.hoisted(() => ({
  useConversations: vi.fn(),
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks', () => ({
  useConversations: mocks.useConversations,
  useDeleteConversation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock('@/lib/query', () => ({
  queryKeys: {
    knowledgeBases: {
      conversations: (kbId: string) => ['knowledgeBases', 'detail', kbId, 'conversations'],
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

import { ConversationList } from '@/components/chat/ConversationList';

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render grouped conversations and allow selecting a conversation', async () => {
    const onSelect = vi.fn();
    const onNewConversation = vi.fn();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    mocks.useConversations.mockReturnValue({
      data: {
        items: [
          {
            id: 'conv-today',
            title: 'Today chat',
            knowledgeBaseId: null,
            messageCount: 2,
            lastMessageAt: now,
            createdAt: now,
          },
          {
            id: 'conv-yesterday',
            title: 'Yesterday chat',
            knowledgeBaseId: null,
            messageCount: 1,
            lastMessageAt: yesterday,
            createdAt: yesterday,
          },
        ],
        pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
      },
      isLoading: false,
    });

    const view = await render(
      <ConversationList
        knowledgeBaseId={undefined}
        currentConversationId={null}
        onSelect={onSelect}
        onNewConversation={onNewConversation}
      />
    );

    expect(view.container.textContent).toContain('conversation.group.today');
    expect(view.container.textContent).toContain('conversation.group.yesterday');
    expect(view.container.textContent).toContain('Today chat');
    expect(view.container.textContent).toContain('Yesterday chat');

    const conversationButton = Array.from(view.container.querySelectorAll('[role="button"]')).find(
      (element) => element.textContent?.includes('Today chat')
    );
    await fireClick(conversationButton);

    expect(onSelect).toHaveBeenCalledWith('conv-today');

    const newButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('conversation.newConversation')
    );
    await fireClick(newButton ?? null);
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    await view.unmount();
  });

  it('should delete current conversation and trigger invalidation callback flow', async () => {
    const onCurrentConversationDeleted = vi.fn();
    const onNewConversation = vi.fn();

    mocks.useConversations.mockReturnValue({
      data: {
        items: [
          {
            id: 'conv-1',
            title: 'Current chat',
            knowledgeBaseId: null,
            messageCount: 3,
            lastMessageAt: new Date(),
            createdAt: new Date(),
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
      },
      isLoading: false,
    });
    mocks.mutateAsync.mockResolvedValue(undefined);

    const view = await render(
      <ConversationList
        knowledgeBaseId="kb-1"
        currentConversationId="conv-1"
        onSelect={vi.fn()}
        onNewConversation={onNewConversation}
        onCurrentConversationDeleted={onCurrentConversationDeleted}
      />
    );

    const deleteButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'delete'
    );
    await fireClick(deleteButton ?? null);
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalledWith('conv-1');
    expect(onCurrentConversationDeleted).toHaveBeenCalledTimes(1);
    expect(onNewConversation).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['knowledgeBases', 'detail', 'kb-1', 'conversations'],
    });

    await view.unmount();
  });
});

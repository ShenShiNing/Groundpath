import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Citation } from '@/stores';
import { render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  chatMarkdown: vi.fn(),
  citationSources: vi.fn(),
  toolStepsDisplay: vi.fn(),
  thinkingStepCard: vi.fn(),
  assistantMessageActions: vi.fn(),
  userMessage: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../src/components/chat/ChatMarkdown', () => ({
  ChatMarkdown: ({
    content,
  }: {
    content: string;
    citations?: Citation[];
    onCitationClick: (citation: Citation) => void;
    isStreaming?: boolean;
  }) => {
    mocks.chatMarkdown(content);
    return <div data-testid="chat-markdown">{content}</div>;
  },
}));

vi.mock('../../../src/components/chat/CitationSources', () => ({
  CitationSources: ({ citations }: { citations: Citation[] }) => {
    mocks.citationSources(citations);
    return <div data-testid="citation-sources">{citations.length}</div>;
  },
}));

vi.mock('../../../src/components/chat/ToolStepsDisplay', () => ({
  ToolStepsDisplay: ({ steps }: { steps: unknown[] }) => {
    mocks.toolStepsDisplay(steps);
    return <div data-testid="tool-steps-display">{steps.length}</div>;
  },
}));

vi.mock('../../../src/components/chat/ThinkingStepCard', () => ({
  ThinkingStepCard: ({ content }: { content: string }) => {
    mocks.thinkingStepCard(content);
    return <div data-testid="thinking-step-card">{content}</div>;
  },
}));

vi.mock('../../../src/components/chat/AssistantMessageActions', () => ({
  AssistantMessageActions: ({ messageId }: { messageId: string }) => {
    mocks.assistantMessageActions(messageId);
    return <div data-testid="assistant-message-actions">{messageId}</div>;
  },
}));

vi.mock('../../../src/components/chat/UserMessage', () => ({
  UserMessage: ({ message }: { message: { id: string; content: string } }) => {
    mocks.userMessage(message.id);
    return <div data-testid="user-message">{message.content}</div>;
  },
}));

import { ChatMessage } from '../../../src/components/chat/ChatMessage';
import type { ChatMessageProps } from '../../../src/components/chat/ChatMessage';

const citation: Citation = {
  id: 'cit-1',
  documentId: 'doc-1',
  documentTitle: 'Guide',
  excerpt: 'Reference excerpt',
  sourceType: 'chunk',
  chunkIndex: 0,
  content: 'Reference excerpt',
};

function createAssistantMessage(
  overrides: Partial<ChatMessageProps['message']> = {}
): ChatMessageProps['message'] {
  const toolStep = {
    stepIndex: 0,
    toolCalls: [],
    status: 'completed' as const,
  };

  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Initial answer',
    timestamp: new Date('2026-03-25T00:00:00.000Z'),
    citations: [citation],
    toolSteps: [toolStep],
    ...overrides,
  };
}

describe('ChatMessage', () => {
  const onCitationClick = vi.fn();
  const onCopyMessage = vi.fn();
  const onEditMessage = vi.fn();
  const onRegenerateMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips assistant markdown rerender when the parent passes an equivalent cloned message', async () => {
    const message = createAssistantMessage();

    const view = await render(
      <ChatMessage
        message={message}
        onCitationClick={onCitationClick}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onRegenerateMessage={onRegenerateMessage}
        canRegenerate
      />
    );

    expect(mocks.chatMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.assistantMessageActions).toHaveBeenCalledTimes(1);

    const nextMessage = createAssistantMessage({
      timestamp: new Date(message.timestamp.getTime()),
      citations: [...(message.citations ?? [])],
      toolSteps: [...(message.toolSteps ?? [])],
    });

    await view.rerender(
      <ChatMessage
        message={nextMessage}
        onCitationClick={onCitationClick}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onRegenerateMessage={onRegenerateMessage}
        canRegenerate
      />
    );

    expect(mocks.chatMarkdown).toHaveBeenCalledTimes(1);
    expect(mocks.assistantMessageActions).toHaveBeenCalledTimes(1);

    await view.unmount();
  });

  it('rerenders assistant markdown when render-relevant message fields change', async () => {
    const message = createAssistantMessage();

    const view = await render(
      <ChatMessage
        message={message}
        onCitationClick={onCitationClick}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onRegenerateMessage={onRegenerateMessage}
        canRegenerate
      />
    );

    expect(mocks.chatMarkdown).toHaveBeenCalledTimes(1);

    await view.rerender(
      <ChatMessage
        message={createAssistantMessage({ content: 'Updated answer' })}
        onCitationClick={onCitationClick}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onRegenerateMessage={onRegenerateMessage}
        canRegenerate
      />
    );

    expect(mocks.chatMarkdown).toHaveBeenCalledTimes(2);
    expect(mocks.chatMarkdown).toHaveBeenLastCalledWith('Updated answer');

    await view.unmount();
  });
});

import i18n from '@/i18n/i18n';
import { queryClient, queryKeys } from '@/lib/query';
import type { ConversationWithMessages, MessageInfo } from '@knowledge-agent/shared/types';
import type { ChatMessage, ChatPanelState } from './chatPanelStore.types';
import { agentTraceToToolSteps, toStoreCitation } from './chatPanelStore.types';

export type SetState = (
  updater: Partial<ChatPanelState> | ((state: ChatPanelState) => Partial<ChatPanelState>)
) => void;

export type GetState = () => ChatPanelState;

export function invalidateConversationQueries(): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.lists(),
  });
}

export function getChatErrorMessage(error: { code: string; message: string }): string {
  switch (error.code) {
    case 'LLM_CONFIG_NOT_FOUND':
      return i18n.t('error.llmNotConfigured', { ns: 'chat' });
    case 'LLM_DECRYPTION_FAILED':
      return i18n.t('error.llmApiKeyUnreadable', { ns: 'chat' });
    default:
      return `Error: ${error.message}`;
  }
}

export function toStoreMessage(message: MessageInfo): ChatMessage {
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: new Date(message.createdAt),
    citations:
      message.metadata?.finalCitations?.map(toStoreCitation) ??
      message.metadata?.citations?.map(toStoreCitation) ??
      message.metadata?.retrievedSources?.map(toStoreCitation),
    retrievedSources: message.metadata?.retrievedSources?.map(toStoreCitation),
    thinkingContent: message.metadata?.thinkingContent,
    stopReason: message.metadata?.stopReason,
    toolSteps: agentTraceToToolSteps(message.metadata?.agentTrace),
  };
}

export function toConversationState(
  conversation: ConversationWithMessages
): Pick<ChatPanelState, 'conversationId' | 'knowledgeBaseId' | 'messages'> {
  return {
    conversationId: conversation.id,
    knowledgeBaseId: conversation.knowledgeBaseId,
    messages: conversation.messages.map(toStoreMessage),
  };
}

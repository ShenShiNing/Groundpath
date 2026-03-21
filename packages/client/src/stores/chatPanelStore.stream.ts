import i18n from '@/i18n/i18n';
import { conversationApi, sendMessageWithSSE } from '@/api';
import { logClientError } from '@/lib/logger';
import type { ChatPanelState, ChatMessage, StreamControls } from './chatPanelStore.types';
import {
  getChatErrorMessage,
  invalidateConversationQueries,
  type GetState,
  type SetState,
} from './chatPanelStore.core';
import { toStoreCitation } from './chatPanelStore.types';

type StreamActions = Pick<
  ChatPanelState,
  'sendMessage' | 'editMessage' | 'stopGeneration' | 'retryMessage'
>;

export function createStreamActions(set: SetState, get: GetState): StreamActions {
  return {
    sendMessage: async (
      content: string,
      getAccessToken: () => string | null,
      stream?: StreamControls,
      options?: { editedMessageId?: string }
    ) => {
      const {
        knowledgeBaseId,
        conversationId,
        addMessage,
        updateLastMessage,
        appendToLastMessage,
        appendThinkingToLastMessage,
        addToolStep,
        updateToolStep,
        selectedDocumentIds,
      } = get();

      const trimmedContent = content.trim();
      if (!trimmedContent) return;
      stream?.reset();

      const isEdit = !!options?.editedMessageId;

      if (!isEdit) {
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: trimmedContent,
          timestamp: new Date(),
        };
        addMessage(userMessage);
      }

      const assistantId = `assistant-${Date.now()}`;
      const loadingMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };
      addMessage(loadingMessage);

      set({ isLoading: true });
      invalidateConversationQueries();

      let convId = conversationId;
      if (!convId) {
        try {
          const conversation = await conversationApi.create(
            knowledgeBaseId
              ? {
                  knowledgeBaseId,
                  title: trimmedContent.substring(0, 50),
                }
              : {
                  title: trimmedContent.substring(0, 50),
                }
          );
          convId = conversation.id;
          set({ conversationId: convId });
          invalidateConversationQueries();
        } catch (error) {
          logClientError('chatPanelStore.sendMessage.createConversation', error, {
            knowledgeBaseId,
          });
          updateLastMessage({
            content: i18n.t('error.conversationFailed', { ns: 'chat' }),
            isLoading: false,
          });
          set({ isLoading: false, abortController: null });
          return;
        }
      }

      const abortController = sendMessageWithSSE(
        convId,
        {
          content: trimmedContent,
          documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
          editedMessageId: options?.editedMessageId,
        },
        {
          onChunk: (text) => {
            if (stream) {
              stream.push(text);
              return;
            }
            appendToLastMessage(text);
          },
          onThinking: (text) => {
            appendThinkingToLastMessage(text);
          },
          onSources: (citations) => {
            const storeCitations = citations.map(toStoreCitation);
            updateLastMessage({ citations: storeCitations, retrievedSources: storeCitations });
          },
          onToolStart: (data) => {
            addToolStep({
              stepIndex: data.stepIndex,
              toolCalls: data.toolCalls,
              status: 'running',
            });
          },
          onToolEnd: (data) => {
            updateToolStep(data.stepIndex, {
              toolResults: data.toolResults,
              durationMs: data.durationMs,
              status: 'completed',
            });
          },
          onDone: (data) => {
            stream?.flush();
            if (data.userMessageId) {
              set((state) => {
                const msgs = [...state.messages];
                const userIdx = msgs.length - 2;
                if (userIdx >= 0 && msgs[userIdx]?.role === 'user') {
                  msgs[userIdx] = { ...msgs[userIdx], id: data.userMessageId! };
                }
                return { messages: msgs };
              });
            }
            const lastMsg = get().messages[get().messages.length - 1];
            if (lastMsg && !lastMsg.content.trim()) {
              updateLastMessage({
                id: data.messageId,
                content: i18n.t('error.emptyResponse', { ns: 'chat' }),
                stopReason: data.stopReason,
                isLoading: false,
              });
            } else {
              updateLastMessage({
                id: data.messageId,
                stopReason: data.stopReason,
                isLoading: false,
              });
            }
            invalidateConversationQueries();
            set({ isLoading: false, abortController: null });
          },
          onError: (error) => {
            stream?.flush();
            const fallbackMessage = getChatErrorMessage(error);
            updateLastMessage({
              content: get().messages[get().messages.length - 1]?.content || fallbackMessage,
              isLoading: false,
            });
            invalidateConversationQueries();
            set({ isLoading: false, abortController: null });
          },
        },
        getAccessToken
      );

      set({ abortController });
    },

    editMessage: async (
      messageId: string,
      content: string,
      getAccessToken: () => string | null,
      stream?: StreamControls
    ) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      const { conversationId, messages, isLoading, stopGeneration } = get();
      if (!conversationId) return;

      const userIdx = messages.findIndex((message) => message.id === messageId);
      if (userIdx < 0) return;

      const targetMessage = messages[userIdx];
      if (!targetMessage || targetMessage.role !== 'user') return;

      const nextMessage = messages[userIdx + 1];
      const isPendingLatestUser =
        isLoading &&
        userIdx === messages.length - 2 &&
        nextMessage?.role === 'assistant' &&
        nextMessage.isLoading;

      if (isLoading && !isPendingLatestUser) {
        return;
      }

      if (isPendingLatestUser) {
        stream?.flush();
        stopGeneration();
      }

      const isLatestPair = userIdx === messages.length - 2 && nextMessage?.role === 'assistant';

      if (isLatestPair) {
        set((state) => ({
          messages: [
            ...state.messages.slice(0, userIdx),
            { ...targetMessage, content: trimmedContent },
          ],
        }));
        const hasRealId = !messageId.startsWith('user-');
        await get().sendMessage(
          trimmedContent,
          getAccessToken,
          stream,
          hasRealId ? { editedMessageId: messageId } : undefined
        );
      } else {
        await get().sendMessage(trimmedContent, getAccessToken, stream);
      }
    },

    stopGeneration: () => {
      const { abortController, updateLastMessage } = get();
      if (abortController) {
        abortController.abort();
        updateLastMessage({ isLoading: false, stopReason: 'user_aborted' });
        invalidateConversationQueries();
        set({ isLoading: false, abortController: null });
      }
    },

    retryMessage: async (
      messageId: string,
      getAccessToken: () => string | null,
      stream?: StreamControls
    ) => {
      if (get().isLoading) return;

      const { conversationId, messages } = get();
      if (!conversationId) return;

      const assistantIdx = messages.findIndex((message) => message.id === messageId);
      if (assistantIdx < 0) return;

      const userIdx = assistantIdx - 1;
      const userMsg = messages[userIdx];
      if (!userMsg || userMsg.role !== 'user') return;

      const isLatestPair =
        userIdx === messages.length - 2 && messages[userIdx + 1]?.role === 'assistant';

      if (isLatestPair) {
        const hasRealId = !userMsg.id.startsWith('user-');
        set((state) => ({
          messages: state.messages.slice(0, assistantIdx),
        }));
        await get().sendMessage(
          userMsg.content,
          getAccessToken,
          stream,
          hasRealId ? { editedMessageId: userMsg.id } : undefined
        );
      } else {
        await get().sendMessage(userMsg.content, getAccessToken, stream);
      }
    },
  };
}

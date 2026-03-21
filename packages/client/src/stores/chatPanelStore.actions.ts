import type { ChatMessage, ToolStep } from './chatPanelStore.types';
import type { SetState } from './chatPanelStore.core';

export function createMessageActions(set: SetState) {
  return {
    addMessage: (message: ChatMessage) => {
      set((state) => ({
        messages: [...state.messages, message],
      }));
    },

    updateLastMessage: (update: Partial<ChatMessage>) => {
      set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0) {
          messages[lastIndex] = { ...messages[lastIndex], ...update };
        }
        return { messages };
      });
    },

    appendToLastMessage: (text: string) => {
      set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex]) {
          messages[lastIndex] = {
            ...messages[lastIndex],
            content: messages[lastIndex].content + text,
          };
        }
        return { messages };
      });
    },

    appendThinkingToLastMessage: (text: string) => {
      set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex]) {
          messages[lastIndex] = {
            ...messages[lastIndex],
            thinkingContent: (messages[lastIndex].thinkingContent ?? '') + text,
          };
        }
        return { messages };
      });
    },

    addToolStep: (step: ToolStep) => {
      set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex]) {
          const msg = messages[lastIndex];
          messages[lastIndex] = {
            ...msg,
            toolSteps: [...(msg.toolSteps ?? []), step],
          };
        }
        return { messages };
      });
    },

    updateToolStep: (stepIndex: number, update: Partial<ToolStep>) => {
      set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex]?.toolSteps) {
          const msg = messages[lastIndex];
          const toolSteps = [...(msg.toolSteps ?? [])];
          const idx = toolSteps.findIndex((s) => s.stepIndex === stepIndex);
          if (idx >= 0 && toolSteps[idx]) {
            toolSteps[idx] = { ...toolSteps[idx], ...update };
          }
          messages[lastIndex] = { ...msg, toolSteps };
        }
        return { messages };
      });
    },
  };
}

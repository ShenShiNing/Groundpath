import { useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '@/stores';
import { findFirstMatchingTextElement } from './utils';

const AUTO_SCROLL_THRESHOLD_PX = 48;

interface UseChatPageScrollFocusArgs {
  messages: ChatMessage[];
  isLoading: boolean;
  focusMessageId: string | null;
  focusKeyword: string | null;
  clearFocusMessageId: () => void;
  /** Virtual scroll support: scroll virtualizer to render target message before DOM lookup */
  ensureMessageVisible?: (messageId: string) => void;
}

export function useChatPageScrollFocus({
  messages,
  isLoading,
  focusMessageId,
  focusKeyword,
  clearFocusMessageId,
  ensureMessageVisible,
}: UseChatPageScrollFocusArgs) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const primedTurnAssistantIdRef = useRef<string | null>(null);
  const handledFocusMessageIdRef = useRef<string | null>(null);
  const clearFocusTimeoutRef = useRef<number | null>(null);
  const pendingFocusRafRef = useRef<number | null>(null);

  const getMessagesViewport = useCallback((): HTMLDivElement | null => {
    return messagesEndRef.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;
  }, []);

  const updateAutoScrollState = useCallback(() => {
    const viewport = getMessagesViewport();
    if (!viewport) {
      shouldAutoScrollRef.current = true;
      return;
    }

    const isNearBottom =
      viewport.scrollTop + viewport.clientHeight >=
      viewport.scrollHeight - AUTO_SCROLL_THRESHOLD_PX;

    shouldAutoScrollRef.current = isNearBottom;
  }, [getMessagesViewport]);

  useEffect(() => {
    const viewport = getMessagesViewport();
    if (!viewport) return;

    const handleViewportScroll = () => {
      updateAutoScrollState();
    };

    updateAutoScrollState();
    viewport.addEventListener('scroll', handleViewportScroll, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', handleViewportScroll);
    };
  }, [getMessagesViewport, messages.length, updateAutoScrollState]);

  useEffect(() => {
    if (focusMessageId || skipNextAutoScrollRef.current) {
      if (skipNextAutoScrollRef.current) {
        skipNextAutoScrollRef.current = false;
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const previousMessage = messages[messages.length - 2];
    const isNewTurnWithEmptyAssistant =
      lastMessage?.role === 'assistant' &&
      lastMessage.isLoading &&
      !lastMessage.content &&
      previousMessage?.role === 'user' &&
      primedTurnAssistantIdRef.current !== lastMessage.id;

    if (isNewTurnWithEmptyAssistant) {
      primedTurnAssistantIdRef.current = lastMessage.id;
      const latestUserMessageElement = document.getElementById(
        `chat-message-${previousMessage.id}`
      );
      latestUserMessageElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: isLoading ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [focusMessageId, isLoading, messages]);

  // Focus / highlight a specific message
  useEffect(() => {
    if (!focusMessageId || messages.length === 0) return;
    if (handledFocusMessageIdRef.current === focusMessageId) return;

    const applyFocus = (targetElement: HTMLElement) => {
      const keywordTarget = focusKeyword
        ? findFirstMatchingTextElement(targetElement, focusKeyword)
        : null;

      if (keywordTarget) {
        keywordTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      handledFocusMessageIdRef.current = focusMessageId;
      shouldAutoScrollRef.current = false;
      skipNextAutoScrollRef.current = true;

      if (clearFocusTimeoutRef.current !== null) {
        window.clearTimeout(clearFocusTimeoutRef.current);
      }

      clearFocusTimeoutRef.current = window.setTimeout(() => {
        handledFocusMessageIdRef.current = null;
        clearFocusTimeoutRef.current = null;
        clearFocusMessageId();
      }, 2200);
    };

    const targetElement = document.getElementById(`chat-message-${focusMessageId}`);
    if (targetElement) {
      applyFocus(targetElement);
      return;
    }

    // Element not in DOM — ask virtualizer to scroll it into view, then retry
    if (ensureMessageVisible) {
      ensureMessageVisible(focusMessageId);

      if (pendingFocusRafRef.current !== null) {
        window.cancelAnimationFrame(pendingFocusRafRef.current);
      }

      // Double rAF: wait for virtualizer re-render + paint
      pendingFocusRafRef.current = window.requestAnimationFrame(() => {
        pendingFocusRafRef.current = window.requestAnimationFrame(() => {
          pendingFocusRafRef.current = null;
          const el = document.getElementById(`chat-message-${focusMessageId}`);
          if (el) {
            applyFocus(el);
          } else {
            handledFocusMessageIdRef.current = null;
            clearFocusMessageId();
          }
        });
      });
      return;
    }

    handledFocusMessageIdRef.current = null;
    clearFocusMessageId();
  }, [clearFocusMessageId, ensureMessageVisible, focusKeyword, focusMessageId, messages]);

  useEffect(() => {
    return () => {
      if (clearFocusTimeoutRef.current !== null) {
        window.clearTimeout(clearFocusTimeoutRef.current);
      }
      if (pendingFocusRafRef.current !== null) {
        window.cancelAnimationFrame(pendingFocusRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (focusMessageId) {
      return;
    }

    handledFocusMessageIdRef.current = null;
  }, [focusMessageId]);

  const prepareForAssistantStream = useCallback(() => {
    shouldAutoScrollRef.current = true;
    primedTurnAssistantIdRef.current = null;
  }, []);

  return {
    messagesEndRef,
    prepareForAssistantStream,
  };
}

import { BRAND_STORAGE_KEYS } from '@groundpath/shared/constants';
import type { KnowledgeBaseListItem } from '@groundpath/shared/types';

export type ChatScopeValue = string | null;

const CHAT_SCOPE_STORAGE_KEY = BRAND_STORAGE_KEYS.chatScope;
const GENERAL_SCOPE_STORAGE_VALUE = '__general__';

export function readStoredChatScope(): ChatScopeValue | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const value = window.localStorage.getItem(CHAT_SCOPE_STORAGE_KEY);
  if (value === null) {
    return undefined;
  }

  return value === GENERAL_SCOPE_STORAGE_VALUE ? null : value;
}

export function writeStoredChatScope(value: ChatScopeValue): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    CHAT_SCOPE_STORAGE_KEY,
    value === null ? GENERAL_SCOPE_STORAGE_VALUE : value
  );
}

export function resolveChatScopeValue(
  knowledgeBases: KnowledgeBaseListItem[],
  options?: {
    currentKnowledgeBaseId?: string | null;
    storedScope?: ChatScopeValue;
  }
): ChatScopeValue {
  if (knowledgeBases.length === 0) {
    return null;
  }

  const hasKnowledgeBase = (
    knowledgeBaseId: string | null | undefined
  ): knowledgeBaseId is string =>
    !!knowledgeBaseId &&
    knowledgeBases.some((knowledgeBase) => knowledgeBase.id === knowledgeBaseId);

  if (hasKnowledgeBase(options?.currentKnowledgeBaseId)) {
    return options.currentKnowledgeBaseId;
  }

  if (options?.storedScope === null) {
    return null;
  }

  if (hasKnowledgeBase(options?.storedScope)) {
    return options.storedScope;
  }

  return knowledgeBases.length === 1 ? knowledgeBases[0]!.id : null;
}

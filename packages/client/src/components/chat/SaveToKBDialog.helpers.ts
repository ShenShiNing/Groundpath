import type { TFunction } from 'i18next';
import {
  buildConversationMarkdownForKnowledgeSeed,
  sanitizeMessageContentForKnowledgeSeed,
  type KnowledgeSeedMessage,
} from '@/lib/chat';
import type { ChatMessage } from '@/stores/chatPanelStore';
import { getCitationPreviewText } from '@/stores/chatPanelStore.types';
import type { KnowledgeSeedSource } from './SaveToKBDialog.types';

function toSeedMessage(message: ChatMessage): KnowledgeSeedMessage {
  return {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    citations: message.citations
      ?.map((citation) => ({
        content: getCitationPreviewText(citation).trim(),
      }))
      .filter((citation) => citation.content.length > 0),
    toolSteps: message.toolSteps?.map((step) => ({
      toolCalls: step.toolCalls.map((call) => ({ name: call.name })),
      toolResults: step.toolResults?.map((result) => ({ content: result.content })),
    })),
  };
}

export function sanitizeFileName(input: string): string {
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

export function buildKnowledgeSeedContent(
  messages: ChatMessage[],
  latestAssistantMessage: ChatMessage | null,
  seedSource: KnowledgeSeedSource,
  t: TFunction<'chat'>
): string {
  const conversationContent = buildConversationMarkdownForKnowledgeSeed(
    messages.filter((message) => !message.isLoading).map(toSeedMessage),
    {
      transcript: String(t('export.transcriptTitle')),
      user: String(t('export.user')),
      assistant: String(t('export.assistant')),
    }
  );
  const latestAssistantContent = latestAssistantMessage
    ? sanitizeMessageContentForKnowledgeSeed(toSeedMessage(latestAssistantMessage))
    : '';

  return seedSource === 'latest-assistant' ? latestAssistantContent : conversationContent;
}

export function getKnowledgeSeedDocumentTitle(
  seedSource: KnowledgeSeedSource,
  t: TFunction<'chat'>
): string {
  return seedSource === 'latest-assistant'
    ? String(t('seed.documentTitle.latestAssistant'))
    : String(t('seed.documentTitle.transcript'));
}

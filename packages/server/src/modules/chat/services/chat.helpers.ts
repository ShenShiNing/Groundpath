import type { Response } from 'express';
import type { Citation, MessageMetadata, SSEEvent } from '@knowledge-agent/shared/types';
import type { SearchResult } from '@modules/vector';
import { documentRepository } from '@modules/document/repositories';
import { messageService } from './message.service';
import type { EnrichedSearchResult, PersistAssistantMessageInput } from './chat.types';

export const PROVIDER_ERROR_FALLBACK_CONTENT =
  'The model provider failed before the answer could be completed. Please try again.';

export function buildCitationMetadata(
  finalCitations?: Citation[],
  extras?: Pick<MessageMetadata, 'agentTrace' | 'stopReason' | 'thinkingContent' | 'tokenUsage'> & {
    retrievedSources?: Citation[];
  }
): MessageMetadata | undefined {
  if (
    !finalCitations?.length &&
    !extras?.retrievedSources?.length &&
    !extras?.thinkingContent?.trim() &&
    !extras?.agentTrace?.length &&
    !extras?.stopReason &&
    !extras?.tokenUsage
  ) {
    return undefined;
  }

  return {
    citations: finalCitations,
    retrievedSources: extras?.retrievedSources ?? finalCitations,
    finalCitations,
    ...extras,
  };
}

export function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function sendChunkedSSE(res: Response, content: string, chunkSize: number = 80): void {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    sendSSE(res, { type: 'chunk', data: chunk });
  }
}

export async function enrichSearchResults(
  results: SearchResult[]
): Promise<EnrichedSearchResult[]> {
  if (results.length === 0) return [];

  const docIds = [...new Set(results.map((r) => r.documentId))];
  const docTitles = await documentRepository.getTitlesByIds(docIds);

  return results.map((r) => ({
    documentId: r.documentId,
    documentTitle: docTitles.get(r.documentId) ?? 'Unknown Document',
    chunkIndex: r.chunkIndex,
    content: r.content,
    score: r.score,
    metadata: {},
  }));
}

export async function persistAssistantMessage(input: PersistAssistantMessageInput): Promise<void> {
  await messageService.create({
    id: input.messageId,
    conversationId: input.conversationId,
    role: 'assistant',
    content: input.content,
    metadata: buildCitationMetadata(input.citations, {
      retrievedSources: input.retrievedSources,
      thinkingContent: input.thinkingContent,
      agentTrace: input.agentTrace,
      stopReason: input.stopReason,
    }),
  });
}

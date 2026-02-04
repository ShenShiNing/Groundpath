import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Citation, SSEEvent } from '@knowledge-agent/shared/types';
import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import { searchService } from '@modules/rag';
import type { SearchResult } from '@modules/vector';
import { documentRepository } from '@modules/document';
import { conversationService } from './conversation.service';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { createLogger } from '@shared/logger';

const logger = createLogger('chat.service');

interface SendMessageOptions {
  userId: string;
  conversationId: string;
  content: string;
  documentIds?: string[];
}

interface EnrichedSearchResult {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata?: {
    pageNumber?: number;
  };
}

/**
 * Send SSE event to client
 */
function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Enrich search results with document titles
 */
async function enrichSearchResults(results: SearchResult[]): Promise<EnrichedSearchResult[]> {
  // Get unique document IDs
  const docIds = [...new Set(results.map((r) => r.documentId))];

  // Fetch document titles
  const docTitles = new Map<string, string>();
  await Promise.all(
    docIds.map(async (docId) => {
      const doc = await documentRepository.findById(docId);
      if (doc) {
        docTitles.set(docId, doc.title);
      }
    })
  );

  return results.map((r) => ({
    documentId: r.documentId,
    documentTitle: docTitles.get(r.documentId) ?? 'Unknown Document',
    chunkIndex: r.chunkIndex,
    content: r.content,
    score: r.score,
    metadata: {},
  }));
}

export const chatService = {
  /**
   * Send a message and stream the response via SSE
   */
  async sendMessageWithSSE(res: Response, options: SendMessageOptions): Promise<void> {
    const { userId, conversationId, content, documentIds } = options;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // Validate conversation ownership
      const conversation = await conversationService.validateOwnership(userId, conversationId);

      // Save user message
      await messageService.create({
        conversationId,
        role: 'user',
        content,
      });

      // Update conversation title if first message
      const messageCount = await messageService.count(conversationId);
      if (messageCount === 1) {
        const title = conversationService.generateTitle(content);
        await conversationRepository.update(conversationId, {
          title,
          updatedBy: userId,
        });
      }

      // Perform RAG search if KB is associated
      let searchResults: EnrichedSearchResult[] = [];
      if (conversation.knowledgeBaseId) {
        try {
          const rawResults = await searchService.searchInKnowledgeBase({
            userId,
            knowledgeBaseId: conversation.knowledgeBaseId,
            query: content,
            limit: 5,
            scoreThreshold: 0.5,
            documentIds,
          });
          searchResults = await enrichSearchResults(rawResults);
        } catch (error) {
          logger.warn({ error, conversationId }, 'RAG search failed, continuing without context');
        }
      }

      // Send citations to client
      if (searchResults.length > 0) {
        const citations = promptService.toCitations(searchResults);
        sendSSE(res, { type: 'sources', data: citations });
      }

      // Get conversation history for context
      const history = await messageService.getRecentForContext(conversationId, 10);
      const truncatedHistory = promptService.truncateHistory(history, 4000);

      // Build prompt with RAG context
      const systemPrompt = promptService.buildSystemPrompt(searchResults);
      const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);

      // Get LLM provider for user
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      // Stream response
      let fullContent = '';
      const assistantMessageId = uuidv4();

      try {
        for await (const chunk of provider.streamGenerate(messages, genOptions)) {
          fullContent += chunk;
          sendSSE(res, { type: 'chunk', data: chunk });
        }
      } catch (error) {
        logger.error({ error, conversationId }, 'LLM streaming error');
        sendSSE(res, {
          type: 'error',
          data: {
            code: CHAT_ERROR_CODES.STREAMING_FAILED,
            message: error instanceof Error ? error.message : 'Streaming failed',
          },
        });
        res.end();
        return;
      }

      // Save assistant message
      const citations =
        searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
      await messageService.create({
        conversationId,
        role: 'assistant',
        content: fullContent,
        metadata: {
          citations,
          // Token usage would come from provider if available
        },
      });

      // Touch conversation to update timestamp
      await conversationRepository.touch(conversationId, userId);

      // Send completion event
      sendSSE(res, {
        type: 'done',
        data: { messageId: assistantMessageId },
      });

      res.end();
    } catch (error) {
      logger.error({ error, conversationId }, 'Chat service error');

      // Send error via SSE if possible
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
      }

      sendSSE(res, {
        type: 'error',
        data: {
          code:
            error instanceof Error && 'code' in error
              ? (error as { code: string }).code
              : 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      });
      res.end();
    }
  },

  /**
   * Send a message and return complete response (non-streaming)
   */
  async sendMessage(options: SendMessageOptions): Promise<{
    messageId: string;
    content: string;
    citations?: Citation[];
  }> {
    const { userId, conversationId, content, documentIds } = options;

    // Validate conversation ownership
    const conversation = await conversationService.validateOwnership(userId, conversationId);

    // Save user message
    await messageService.create({
      conversationId,
      role: 'user',
      content,
    });

    // Update conversation title if first message
    const messageCount = await messageService.count(conversationId);
    if (messageCount === 1) {
      const title = conversationService.generateTitle(content);
      await conversationRepository.update(conversationId, {
        title,
        updatedBy: userId,
      });
    }

    // Perform RAG search if KB is associated
    let searchResults: EnrichedSearchResult[] = [];
    if (conversation.knowledgeBaseId) {
      try {
        const rawResults = await searchService.searchInKnowledgeBase({
          userId,
          knowledgeBaseId: conversation.knowledgeBaseId,
          query: content,
          limit: 5,
          scoreThreshold: 0.5,
          documentIds,
        });
        searchResults = await enrichSearchResults(rawResults);
      } catch (error) {
        logger.warn({ error, conversationId }, 'RAG search failed, continuing without context');
      }
    }

    // Get conversation history for context
    const history = await messageService.getRecentForContext(conversationId, 10);
    const truncatedHistory = promptService.truncateHistory(history, 4000);

    // Build prompt with RAG context
    const systemPrompt = promptService.buildSystemPrompt(searchResults);
    const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);

    // Get LLM provider for user
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    // Generate response
    const responseContent = await provider.generate(messages, genOptions);

    // Save assistant message
    const citations =
      searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
    const assistantMessage = await messageService.create({
      conversationId,
      role: 'assistant',
      content: responseContent,
      metadata: { citations },
    });

    // Touch conversation to update timestamp
    await conversationRepository.touch(conversationId, userId);

    return {
      messageId: assistantMessage.id,
      content: responseContent,
      citations,
    };
  },
};

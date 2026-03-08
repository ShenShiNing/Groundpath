import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Citation, SSEEvent } from '@knowledge-agent/shared/types';
import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import { searchService } from '@modules/rag';
import type { SearchResult } from '@modules/vector';
import { documentRepository } from '@modules/document';
import { resolveTools, executeAgentLoop } from '@modules/agent';
import { ragConfig } from '@config/env';
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
 * Enrich search results with document titles (single batch query, avoids N+1)
 */
async function enrichSearchResults(results: SearchResult[]): Promise<EnrichedSearchResult[]> {
  if (results.length === 0) return [];

  // Batch-fetch all needed titles in one query
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

/**
 * Send text content as chunked SSE events (simulates streaming for agent results)
 */
function sendChunkedSSE(res: Response, content: string, chunkSize: number = 80): void {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    sendSSE(res, { type: 'chunk', data: chunk });
  }
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

      // Resolve available tools
      const toolContext = {
        userId,
        conversationId,
        knowledgeBaseId: conversation.knowledgeBaseId,
        documentIds,
      };
      const tools = resolveTools(toolContext);

      // Get LLM provider for user
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      const assistantMessageId = uuidv4();
      const abortController = new AbortController();
      let clientDisconnected = false;

      // Listen for client disconnect to abort
      const onClose = () => {
        clientDisconnected = true;
        abortController.abort();
        logger.info({ conversationId }, 'Client disconnected, aborting');
      };
      res.on('close', onClose);

      try {
        // Decide: Agent mode (Agentic RAG) vs legacy streaming mode
        // Agent mode when tools are available AND provider supports tool calling.
        // The LLM autonomously decides which tools to call and how many times.
        const useAgentMode = tools.length > 0 && !!provider.generateWithTools;

        if (useAgentMode) {
          // --- Agentic RAG mode ---
          // LLM autonomously orchestrates tool calls (KB search, web search).
          // System prompt enforces KB search priority when a knowledge base is associated.
          const hasKnowledgeBase = !!conversation.knowledgeBaseId;
          const hasWebSearch = tools.some((t) => t.definition.name === 'web_search');

          logger.debug(
            {
              conversationId,
              toolCount: tools.length,
              hasKnowledgeBase,
              hasWebSearch,
              provider: provider.name,
            },
            'Using agent mode'
          );

          const history = await messageService.getRecentForContext(conversationId, 10);
          const truncatedHistory = promptService.truncateHistory(history, 4000);
          const systemPrompt = promptService.buildAgentSystemPrompt({
            hasKnowledgeBase,
            hasWebSearch,
          });
          const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);

          const agentResult = await executeAgentLoop({
            provider,
            messages,
            tools,
            toolContext: { ...toolContext, signal: abortController.signal },
            genOptions: { ...genOptions, signal: abortController.signal },
            onToolStart: (stepIndex, toolCalls) => {
              if (!clientDisconnected) {
                sendSSE(res, { type: 'tool_start', data: { stepIndex, toolCalls } });
              }
            },
            onToolEnd: (stepIndex, toolResults, durationMs) => {
              if (!clientDisconnected) {
                sendSSE(res, { type: 'tool_end', data: { stepIndex, toolResults, durationMs } });
              }
            },
          });

          if (clientDisconnected) return;

          // Send citations from agent tool calls (KB search + web search)
          if (agentResult.citations.length > 0) {
            sendSSE(res, { type: 'sources', data: agentResult.citations });
          }

          // Send content as chunked SSE
          if (agentResult.content) {
            sendChunkedSSE(res, agentResult.content);
          }

          // Reject empty responses
          if (!agentResult.content.trim()) {
            logger.warn({ conversationId, userId }, 'Agent returned empty content');
            sendSSE(res, {
              type: 'error',
              data: {
                code: CHAT_ERROR_CODES.STREAMING_FAILED,
                message: 'The model returned an empty response. Please try again.',
              },
            });
            res.end();
            return;
          }

          // Save assistant message
          await messageService.create({
            id: assistantMessageId,
            conversationId,
            role: 'assistant',
            content: agentResult.content,
            metadata: {
              citations: agentResult.citations.length > 0 ? agentResult.citations : undefined,
              agentTrace: agentResult.agentTrace.length > 0 ? agentResult.agentTrace : undefined,
            },
          });
        } else {
          // --- Legacy streaming mode (hardcoded RAG + streaming) ---
          let searchResults: EnrichedSearchResult[] = [];
          if (conversation.knowledgeBaseId) {
            try {
              const rawResults = await searchService.searchInKnowledgeBase({
                userId,
                knowledgeBaseId: conversation.knowledgeBaseId,
                query: content,
                limit: ragConfig.searchDefaultLimit,
                scoreThreshold: ragConfig.searchDefaultScoreThreshold,
                documentIds,
              });
              searchResults = await enrichSearchResults(rawResults);
            } catch (error) {
              logger.warn(
                { error, conversationId },
                'RAG search failed, continuing without context'
              );
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

          // Stream response
          let fullContent = '';

          try {
            for await (const chunk of provider.streamGenerate(messages, {
              ...genOptions,
              signal: abortController.signal,
            })) {
              if (clientDisconnected) break;
              fullContent += chunk;
              sendSSE(res, { type: 'chunk', data: chunk });
            }
          } catch (error) {
            if (clientDisconnected || (error instanceof Error && error.name === 'AbortError')) {
              logger.info({ conversationId }, 'LLM stream aborted due to client disconnect');
              return;
            }
            logger.error({ err: error, conversationId }, 'LLM streaming error');
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

          if (clientDisconnected) return;

          // Reject empty responses
          if (!fullContent.trim()) {
            logger.warn({ conversationId, userId }, 'LLM stream completed with empty content');
            sendSSE(res, {
              type: 'error',
              data: {
                code: CHAT_ERROR_CODES.STREAMING_FAILED,
                message: 'The model returned an empty response. Please try again.',
              },
            });
            res.end();
            return;
          }

          // Save assistant message
          const citations =
            searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
          await messageService.create({
            id: assistantMessageId,
            conversationId,
            role: 'assistant',
            content: fullContent,
            metadata: { citations },
          });
        }
      } finally {
        res.off('close', onClose);
      }

      if (clientDisconnected) return;

      // Touch conversation to update timestamp
      await conversationRepository.touch(conversationId, userId);

      // Send completion event
      sendSSE(res, {
        type: 'done',
        data: { messageId: assistantMessageId },
      });

      res.end();
    } catch (error) {
      // Abort errors from client disconnect are expected, not real failures
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info({ conversationId }, 'Chat request aborted');
        return;
      }

      logger.error({ err: error, conversationId }, 'Chat service error');

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

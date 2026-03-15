/**
 * Generation Service
 * Handles document generation and expansion with optional RAG enhancement
 */

import type { Response } from 'express';
import type {
  GenerationTemplate,
  GenerationStyle,
  GenerationResponse,
  ExpandResponse,
} from '@knowledge-agent/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import type { ChatMessage } from '@modules/llm';
import { documentContentService } from '@modules/document/services/content';
import { searchService } from '@modules/rag/services';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { ragConfig } from '@config/env';
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
} from '../prompts/generation.prompts';
import { countWords, sendSSE, initSSEStream, streamLLMToSSE, handleSSEError } from '../helpers';

const logger = createLogger('generation.service');

interface GenerateOptions {
  userId: string;
  prompt: string;
  template?: GenerationTemplate;
  style?: GenerationStyle;
  language?: string;
  maxLength?: number;
  knowledgeBaseId?: string;
  contextDocumentIds?: string[];
}

interface StreamGenerateOptions extends GenerateOptions {
  signal?: AbortSignal;
}

interface ExpandOptions {
  userId: string;
  documentId: string;
  instruction: string;
  position: 'before' | 'after' | 'replace';
  style?: GenerationStyle;
  maxLength?: number;
  knowledgeBaseId?: string;
}

interface StreamExpandOptions extends ExpandOptions {
  signal?: AbortSignal;
}

/**
 * Fetch RAG context from knowledge base
 */
async function fetchRAGContext(
  userId: string,
  knowledgeBaseId: string,
  query: string,
  documentIds?: string[]
): Promise<string | null> {
  try {
    const results = await searchService.searchInKnowledgeBase({
      userId,
      knowledgeBaseId,
      query,
      limit: ragConfig.searchDefaultLimit,
      scoreThreshold: ragConfig.searchDefaultScoreThreshold,
      documentIds,
    });

    if (results.length === 0) {
      return null;
    }

    const contextParts = results.map((r, i) => `[参考 ${i + 1}]\n${r.content}`);
    return contextParts.join('\n\n');
  } catch (error) {
    logger.warn({ error, knowledgeBaseId }, 'Failed to fetch RAG context');
    return null;
  }
}

export const generationService = {
  /**
   * Generate new content (non-streaming)
   */
  async generate(options: GenerateOptions): Promise<GenerationResponse> {
    const {
      userId,
      prompt,
      template,
      style = 'formal',
      language,
      maxLength,
      knowledgeBaseId,
      contextDocumentIds,
    } = options;
    const startTime = Date.now();

    logger.info({ userId, template, style }, 'Starting content generation');

    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    let context: string | null = null;
    if (knowledgeBaseId) {
      context = await fetchRAGContext(userId, knowledgeBaseId, prompt, contextDocumentIds);
    }

    const systemPrompt = buildGenerationSystemPrompt({ template, style, language, maxLength });
    const userPrompt = buildGenerationUserPrompt(prompt, context ?? undefined, language);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const content = await provider.generate(messages, genOptions);
    const wordCount = countWords(content);

    const result: GenerationResponse = {
      content,
      wordCount,
      template,
      style,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      { userId, wordCount, durationMs: Date.now() - startTime },
      'Content generation completed'
    );

    return result;
  },

  /**
   * Stream content generation via SSE
   */
  async streamGenerate(res: Response, options: StreamGenerateOptions): Promise<void> {
    const {
      userId,
      prompt,
      template,
      style = 'formal',
      language,
      maxLength,
      knowledgeBaseId,
      contextDocumentIds,
      signal,
    } = options;

    const sse = initSSEStream(res);

    try {
      logger.info({ userId, template, style }, 'Starting streaming content generation');

      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      let context: string | null = null;
      if (knowledgeBaseId) {
        context = await fetchRAGContext(userId, knowledgeBaseId, prompt, contextDocumentIds);
      }

      const systemPrompt = buildGenerationSystemPrompt({ template, style, language, maxLength });
      const userPrompt = buildGenerationUserPrompt(prompt, context ?? undefined, language);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      await streamLLMToSSE(res, provider, messages, genOptions, {
        isDisconnected: sse.isDisconnected,
        signal,
      });
      res.end();
    } catch (error) {
      handleSSEError(error, res, sse.isDisconnected(), 'content generation');
    } finally {
      sse.cleanup();
    }
  },

  /**
   * Expand existing document (non-streaming)
   */
  async expand(options: ExpandOptions): Promise<ExpandResponse> {
    const { userId, documentId, instruction, position, style, maxLength, knowledgeBaseId } =
      options;
    const startTime = Date.now();

    logger.info({ userId, documentId, position }, 'Starting document expansion');

    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to expand',
        400
      );
    }

    const existingContent = docContent.textContent;
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    let context: string | null = null;
    if (knowledgeBaseId) {
      context = await fetchRAGContext(userId, knowledgeBaseId, instruction);
    }

    const systemPrompt = buildExpandSystemPrompt({ position, style, maxLength });
    const userPrompt = buildExpandUserPrompt(instruction, existingContent, context ?? undefined);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const content = await provider.generate(messages, genOptions);
    const wordCount = countWords(content);

    const result: ExpandResponse = {
      content,
      wordCount,
      position,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      { userId, documentId, wordCount, durationMs: Date.now() - startTime },
      'Document expansion completed'
    );

    return result;
  },

  /**
   * Stream document expansion via SSE
   */
  async streamExpand(res: Response, options: StreamExpandOptions): Promise<void> {
    const { userId, documentId, instruction, position, style, maxLength, knowledgeBaseId, signal } =
      options;

    const sse = initSSEStream(res);

    try {
      logger.info({ userId, documentId, position }, 'Starting streaming document expansion');

      const docContent = await documentContentService.getContent(documentId, userId);

      if (!docContent.textContent || docContent.textContent.trim().length === 0) {
        sendSSE(res, {
          type: 'error',
          data: {
            code: DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY,
            message: 'Document has no text content to expand',
          },
        });
        res.end();
        return;
      }

      const existingContent = docContent.textContent;
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      let context: string | null = null;
      if (knowledgeBaseId) {
        context = await fetchRAGContext(userId, knowledgeBaseId, instruction);
      }

      const systemPrompt = buildExpandSystemPrompt({ position, style, maxLength });
      const userPrompt = buildExpandUserPrompt(instruction, existingContent, context ?? undefined);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      await streamLLMToSSE(res, provider, messages, genOptions, {
        isDisconnected: sse.isDisconnected,
        signal,
      });
      res.end();
    } catch (error) {
      handleSSEError(error, res, sse.isDisconnected(), 'document expansion');
    } finally {
      sse.cleanup();
    }
  },
};

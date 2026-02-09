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
  DocumentAISSEEvent,
} from '@knowledge-agent/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import type { ChatMessage } from '@modules/llm';
import { documentContentService } from '@modules/document';
import { searchService } from '@modules/rag';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
} from '../prompts/generation.prompts';

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
 * Count words in text (handles both CJK and English)
 */
function countWords(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const englishWords = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return cjkChars + englishWords;
}

/**
 * Send SSE event to client
 */
function sendSSE(res: Response, event: DocumentAISSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
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
      limit: 5,
      scoreThreshold: 0.5,
      documentIds,
    });

    if (results.length === 0) {
      return null;
    }

    // Format context from search results
    const contextParts = results.map((r, i) => {
      return `[参考 ${i + 1}]\n${r.content}`;
    });

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

    // Get LLM provider
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    // Fetch RAG context if knowledge base is specified
    let context: string | null = null;
    if (knowledgeBaseId) {
      context = await fetchRAGContext(userId, knowledgeBaseId, prompt, contextDocumentIds);
    }

    // Build prompts
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let clientDisconnected = false;
    const onClose = () => {
      clientDisconnected = true;
    };
    res.on('close', onClose);

    try {
      logger.info({ userId, template, style }, 'Starting streaming content generation');

      // Get LLM provider
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      // Fetch RAG context if knowledge base is specified
      let context: string | null = null;
      if (knowledgeBaseId) {
        context = await fetchRAGContext(userId, knowledgeBaseId, prompt, contextDocumentIds);
      }

      // Build prompts
      const systemPrompt = buildGenerationSystemPrompt({ template, style, language, maxLength });
      const userPrompt = buildGenerationUserPrompt(prompt, context ?? undefined, language);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let fullContent = '';
      for await (const chunk of provider.streamGenerate(messages, {
        ...genOptions,
        signal,
      })) {
        if (clientDisconnected) break;
        fullContent += chunk;
        sendSSE(res, { type: 'chunk', data: chunk });
      }

      if (!clientDisconnected) {
        sendSSE(res, {
          type: 'done',
          data: {
            wordCount: countWords(fullContent),
            generatedAt: new Date().toISOString(),
          },
        });
      }
      res.end();
    } catch (error) {
      logger.error({ error }, 'Streaming content generation failed');

      if (!clientDisconnected && !res.headersSent) {
        sendSSE(res, {
          type: 'error',
          data: {
            code: DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED,
            message: error instanceof Error ? error.message : 'Streaming failed',
          },
        });
      }
      res.end();
    } finally {
      res.off('close', onClose);
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

    // Get document content
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to expand',
        400
      );
    }

    const existingContent = docContent.textContent;

    // Get LLM provider
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    // Fetch RAG context if knowledge base is specified
    let context: string | null = null;
    if (knowledgeBaseId) {
      context = await fetchRAGContext(userId, knowledgeBaseId, instruction);
    }

    // Build prompts
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let clientDisconnected = false;
    const onClose = () => {
      clientDisconnected = true;
    };
    res.on('close', onClose);

    try {
      logger.info({ userId, documentId, position }, 'Starting streaming document expansion');

      // Get document content
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

      // Get LLM provider
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      // Fetch RAG context if knowledge base is specified
      let context: string | null = null;
      if (knowledgeBaseId) {
        context = await fetchRAGContext(userId, knowledgeBaseId, instruction);
      }

      // Build prompts
      const systemPrompt = buildExpandSystemPrompt({ position, style, maxLength });
      const userPrompt = buildExpandUserPrompt(instruction, existingContent, context ?? undefined);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let fullContent = '';
      for await (const chunk of provider.streamGenerate(messages, {
        ...genOptions,
        signal,
      })) {
        if (clientDisconnected) break;
        fullContent += chunk;
        sendSSE(res, { type: 'chunk', data: chunk });
      }

      if (!clientDisconnected) {
        sendSSE(res, {
          type: 'done',
          data: {
            wordCount: countWords(fullContent),
            generatedAt: new Date().toISOString(),
          },
        });
      }
      res.end();
    } catch (error) {
      logger.error({ error, documentId }, 'Streaming document expansion failed');

      if (!clientDisconnected && !res.headersSent) {
        sendSSE(res, {
          type: 'error',
          data: {
            code: DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED,
            message: error instanceof Error ? error.message : 'Streaming failed',
          },
        });
      }
      res.end();
    } finally {
      res.off('close', onClose);
    }
  },
};

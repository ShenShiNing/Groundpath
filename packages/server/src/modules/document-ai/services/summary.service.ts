/**
 * Summary Service
 * Handles document summarization with support for long documents
 */

import type { Response } from 'express';
import type {
  SummaryLength,
  SummaryResponse,
  DocumentAISSEEvent,
} from '@knowledge-agent/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import type { ChatMessage } from '@modules/llm';
import { documentContentService } from '@modules/document';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  buildChunkSummaryPrompt,
  buildMergeSummariesPrompt,
  buildMergeUserPrompt,
} from '../prompts/summary.prompts';

const logger = createLogger('summary.service');

// Configuration for long document handling
const MAX_CONTEXT_TOKENS = 8000;
const CHARS_PER_TOKEN = 3; // Conservative estimate for mixed CJK/English
const BATCH_SIZE = 5;

interface SummaryOptions {
  userId: string;
  documentId: string;
  length: SummaryLength;
  language?: string;
  focusAreas?: string[];
}

interface StreamSummaryOptions extends SummaryOptions {
  signal?: AbortSignal;
}

/**
 * Estimate token count from character count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks of approximately equal size
 */
function splitIntoChunks(text: string, maxChunkTokens: number): string[] {
  const maxChunkChars = maxChunkTokens * CHARS_PER_TOKEN;
  const chunks: string[] = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // If single paragraph is too long, split by sentences
      if (paragraph.length > maxChunkChars) {
        const sentences = paragraph.split(/(?<=[.!?。！？])\s+/);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 > maxChunkChars) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
          }
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Count words in text (handles both CJK and English)
 */
function countWords(text: string): number {
  // Count CJK characters as individual words
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  // Count English words
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

export const summaryService = {
  /**
   * Generate a summary for a document (non-streaming)
   */
  async generateSummary(options: SummaryOptions): Promise<SummaryResponse> {
    const { userId, documentId, length, language, focusAreas } = options;
    const startTime = Date.now();

    logger.info({ documentId, userId, length }, 'Starting document summarization');

    // Get document content
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to summarize',
        400
      );
    }

    const textContent = docContent.textContent;
    const estimatedTokens = estimateTokens(textContent);

    // Get LLM provider
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    let summary: string;

    if (estimatedTokens <= MAX_CONTEXT_TOKENS) {
      // Direct summarization for shorter documents
      summary = await this.directSummarize(
        provider,
        textContent,
        { length, language, focusAreas },
        genOptions
      );
    } else {
      // Hierarchical summarization for long documents
      summary = await this.hierarchicalSummarize(
        provider,
        textContent,
        { length, language, focusAreas },
        genOptions
      );
    }

    const wordCount = countWords(summary);
    const result: SummaryResponse = {
      summary,
      wordCount,
      language: language || 'zh',
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      { documentId, userId, wordCount, durationMs: Date.now() - startTime },
      'Document summarization completed'
    );

    return result;
  },

  /**
   * Stream summary generation via SSE
   */
  async streamSummary(res: Response, options: StreamSummaryOptions): Promise<void> {
    const { userId, documentId, length, language, focusAreas, signal } = options;

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
      logger.info({ documentId, userId, length }, 'Starting streaming summarization');

      // Get document content
      const docContent = await documentContentService.getContent(documentId, userId);

      if (!docContent.textContent || docContent.textContent.trim().length === 0) {
        sendSSE(res, {
          type: 'error',
          data: {
            code: DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY,
            message: 'Document has no text content to summarize',
          },
        });
        res.end();
        return;
      }

      const textContent = docContent.textContent;
      const estimatedTokens = estimateTokens(textContent);

      // Get LLM provider
      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      // Build prompts
      const systemPrompt = buildSummarySystemPrompt({ length, language, focusAreas });
      let userPrompt: string;

      if (estimatedTokens <= MAX_CONTEXT_TOKENS) {
        userPrompt = buildSummaryUserPrompt(textContent, language);
      } else {
        // For long documents, first do hierarchical summarization to get partial summaries
        // Then stream the final merge
        const chunks = splitIntoChunks(textContent, Math.floor(MAX_CONTEXT_TOKENS / 2));
        const partialSummaries: string[] = [];

        // Generate partial summaries (non-streaming)
        for (let i = 0; i < chunks.length && !clientDisconnected; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          for (let j = 0; j < batch.length && !clientDisconnected; j++) {
            const chunkIndex = i + j;
            const chunkContent = batch[j];
            if (!chunkContent) continue;
            const chunkPrompt = buildChunkSummaryPrompt(chunkIndex, chunks.length, language);
            const messages: ChatMessage[] = [
              { role: 'system', content: chunkPrompt },
              { role: 'user', content: chunkContent },
            ];
            const partialSummary = await provider.generate(messages, genOptions);
            partialSummaries.push(partialSummary);
          }
        }

        if (clientDisconnected) {
          return;
        }

        // Build merge prompt
        const mergeSystemPrompt = buildMergeSummariesPrompt({ length, language, focusAreas });
        userPrompt = buildMergeUserPrompt(partialSummaries, language);
        const mergeMessages: ChatMessage[] = [
          { role: 'system', content: mergeSystemPrompt },
          { role: 'user', content: userPrompt },
        ];

        // Stream the final merge
        let fullContent = '';
        for await (const chunk of provider.streamGenerate(mergeMessages, {
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
        return;
      }

      // Direct streaming for short documents
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
      logger.error({ error, documentId }, 'Streaming summarization failed');

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
   * Direct summarization for short documents
   */
  async directSummarize(
    provider: Awaited<ReturnType<typeof llmService.getProviderForUser>>,
    content: string,
    options: { length: SummaryLength; language?: string; focusAreas?: string[] },
    genOptions: Awaited<ReturnType<typeof llmService.getOptionsForUser>>
  ): Promise<string> {
    const systemPrompt = buildSummarySystemPrompt(options);
    const userPrompt = buildSummaryUserPrompt(content, options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return provider.generate(messages, genOptions);
  },

  /**
   * Hierarchical summarization for long documents
   */
  async hierarchicalSummarize(
    provider: Awaited<ReturnType<typeof llmService.getProviderForUser>>,
    content: string,
    options: { length: SummaryLength; language?: string; focusAreas?: string[] },
    genOptions: Awaited<ReturnType<typeof llmService.getOptionsForUser>>
  ): Promise<string> {
    const chunks = splitIntoChunks(content, Math.floor(MAX_CONTEXT_TOKENS / 2));

    logger.info({ chunkCount: chunks.length }, 'Splitting document for hierarchical summarization');

    // Generate summaries for each chunk
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (chunk, j) => {
        const chunkIndex = i + j;
        const systemPrompt = buildChunkSummaryPrompt(chunkIndex, chunks.length, options.language);
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunk },
        ];
        return provider.generate(messages, genOptions);
      });
      const batchResults = await Promise.all(batchPromises);
      chunkSummaries.push(...batchResults);
    }

    // Check if merged summaries fit in context
    const mergedSummaryText = chunkSummaries.join('\n\n');
    const mergedTokens = estimateTokens(mergedSummaryText);

    if (mergedTokens > MAX_CONTEXT_TOKENS) {
      // Recursive summarization needed
      return this.hierarchicalSummarize(provider, mergedSummaryText, options, genOptions);
    }

    // Final merge
    const mergeSystemPrompt = buildMergeSummariesPrompt(options);
    const mergeUserPrompt = buildMergeUserPrompt(chunkSummaries, options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: mergeSystemPrompt },
      { role: 'user', content: mergeUserPrompt },
    ];

    return provider.generate(messages, genOptions);
  },
};

/**
 * Summary Service
 * Handles document summarization with support for long documents
 */

import type { Response } from 'express';
import type { SummaryLength, SummaryResponse } from '@groundpath/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared/constants';
import { llmService } from '@modules/llm';
import type { ChatMessage } from '@modules/llm';
import { documentContentService } from '@modules/document';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { documentAIConfig } from '@config/env';
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  buildChunkSummaryPrompt,
  buildMergeSummariesPrompt,
  buildMergeUserPrompt,
} from '../prompts/summary.prompts';
import { countWords, sendSSE, initSSEStream, streamLLMToSSE, handleSSEError } from '../helpers';

const logger = createLogger('summary.service');

const MAX_CONTEXT_TOKENS = documentAIConfig.maxContextTokens;
const CHARS_PER_TOKEN = documentAIConfig.charsPerToken;
const BATCH_SIZE = documentAIConfig.summaryBatchSize;

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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function splitIntoChunks(text: string, maxChunkTokens: number): string[] {
  const maxChunkChars = maxChunkTokens * CHARS_PER_TOKEN;
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
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

export const summaryService = {
  /**
   * Generate a summary for a document (non-streaming)
   */
  async generateSummary(options: SummaryOptions): Promise<SummaryResponse> {
    const { userId, documentId, length, language, focusAreas } = options;
    const startTime = Date.now();

    logger.info({ documentId, userId, length }, 'Starting document summarization');

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

    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    let summary: string;

    if (estimatedTokens <= MAX_CONTEXT_TOKENS) {
      summary = await this.directSummarize(
        provider,
        textContent,
        { length, language, focusAreas },
        genOptions
      );
    } else {
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

    const sse = initSSEStream(res);

    try {
      logger.info({ documentId, userId, length }, 'Starting streaming summarization');

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

      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      const systemPrompt = buildSummarySystemPrompt({ length, language, focusAreas });

      if (estimatedTokens > MAX_CONTEXT_TOKENS) {
        await this.streamHierarchicalSummary(res, sse, {
          provider,
          genOptions,
          textContent,
          language,
          length,
          focusAreas,
          signal,
        });
        return;
      }

      // Direct streaming for short documents
      const userPrompt = buildSummaryUserPrompt(textContent, language);
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
      handleSSEError(error, res, sse.isDisconnected(), 'summarization');
    } finally {
      sse.cleanup();
    }
  },

  /**
   * Handle hierarchical summarization streaming (long documents)
   */
  async streamHierarchicalSummary(
    res: Response,
    sse: ReturnType<typeof initSSEStream>,
    opts: {
      provider: Awaited<ReturnType<typeof llmService.getProviderForUser>>;
      genOptions: Awaited<ReturnType<typeof llmService.getOptionsForUser>>;
      textContent: string;
      language?: string;
      length: SummaryLength;
      focusAreas?: string[];
      signal?: AbortSignal;
    }
  ): Promise<void> {
    const { provider, genOptions, textContent, language, length, focusAreas, signal } = opts;
    const chunks = splitIntoChunks(textContent, Math.floor(MAX_CONTEXT_TOKENS / 2));
    const partialSummaries: string[] = [];

    // Generate partial summaries (non-streaming)
    for (let i = 0; i < chunks.length && !sse.isDisconnected(); i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      for (let j = 0; j < batch.length && !sse.isDisconnected(); j++) {
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

    if (sse.isDisconnected()) return;

    // Stream the final merge
    const mergeSystemPrompt = buildMergeSummariesPrompt({ length, language, focusAreas });
    const mergeUserPrompt = buildMergeUserPrompt(partialSummaries, language);
    const mergeMessages: ChatMessage[] = [
      { role: 'system', content: mergeSystemPrompt },
      { role: 'user', content: mergeUserPrompt },
    ];

    await streamLLMToSSE(res, provider, mergeMessages, genOptions, {
      isDisconnected: sse.isDisconnected,
      signal,
    });
    res.end();
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
    let firstChunkFailure: unknown;

    logger.info({ chunkCount: chunks.length }, 'Splitting document for hierarchical summarization');

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
      const batchResults = await Promise.allSettled(batchPromises);
      const failedChunkIndexes: number[] = [];

      for (let j = 0; j < batchResults.length; j++) {
        const batchResult = batchResults[j];
        if (batchResult?.status === 'fulfilled') {
          chunkSummaries.push(batchResult.value);
          continue;
        }

        firstChunkFailure ??= batchResult?.reason;
        failedChunkIndexes.push(i + j + 1);
      }

      if (failedChunkIndexes.length > 0) {
        logger.warn(
          {
            failedChunkIndexes,
            totalChunks: chunks.length,
            recoveredChunkCount: batchResults.length - failedChunkIndexes.length,
          },
          'Hierarchical summarization skipped failed chunk summaries'
        );
      }
    }

    if (chunkSummaries.length === 0) {
      throw firstChunkFailure instanceof Error
        ? firstChunkFailure
        : Errors.external('Document chunk summarization failed');
    }

    const mergedSummaryText = chunkSummaries.join('\n\n');
    const mergedTokens = estimateTokens(mergedSummaryText);

    if (mergedTokens > MAX_CONTEXT_TOKENS) {
      return this.hierarchicalSummarize(provider, mergedSummaryText, options, genOptions);
    }

    const mergeSystemPrompt = buildMergeSummariesPrompt(options);
    const mergeUserPrompt = buildMergeUserPrompt(chunkSummaries, options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: mergeSystemPrompt },
      { role: 'user', content: mergeUserPrompt },
    ];

    return provider.generate(messages, genOptions);
  },
};

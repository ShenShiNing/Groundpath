/**
 * Analysis Service
 * Handles document analysis: keywords, entities, topics, and structure
 */

import type {
  AnalysisType,
  AnalysisResponse,
  Keyword,
  Entity,
  Topic,
  DocumentStructure,
  StructureHeading,
  KeywordsResponse,
  EntitiesResponse,
  StructureResponse,
} from '@knowledge-agent/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import type { ChatMessage } from '@modules/llm';
import { documentContentService } from '@modules/document';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import {
  buildKeywordExtractionPrompt,
  buildEntityExtractionPrompt,
  buildTopicIdentificationPrompt,
  buildAnalysisUserPrompt,
} from '../prompts/analysis.prompts';

const logger = createLogger('analysis.service');

// Max content length to send to LLM (avoid token limits)
const MAX_ANALYSIS_CHARS = 30000;

interface AnalysisOptions {
  userId: string;
  documentId: string;
  analysisTypes: AnalysisType[];
  maxKeywords?: number;
  maxEntities?: number;
  maxTopics?: number;
  language?: string;
}

/**
 * Parse JSON from LLM response, handling potential markdown code blocks
 */
function parseJsonResponse<T>(response: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        logger.warn('Failed to parse JSON from code block');
      }
    }

    // Try to find JSON object in response
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        logger.warn('Failed to parse JSON object from response');
      }
    }

    return null;
  }
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
 * Count sentences in text
 */
function countSentences(text: string): number {
  // Match sentence-ending punctuation
  const sentenceEnders = text.match(/[.!?。！？]+/g) || [];
  return Math.max(1, sentenceEnders.length);
}

/**
 * Extract headings from markdown text
 */
function extractHeadings(text: string): StructureHeading[] {
  const headings: StructureHeading[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const match = line.trim().match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1] && match[2]) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        position: i,
      });
    }
  }

  return headings;
}

export const analysisService = {
  /**
   * Perform comprehensive document analysis
   */
  async analyze(options: AnalysisOptions): Promise<AnalysisResponse> {
    const { userId, documentId, analysisTypes, maxKeywords, maxEntities, maxTopics, language } =
      options;
    const startTime = Date.now();

    logger.info({ documentId, userId, analysisTypes }, 'Starting document analysis');

    // Get document content
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to analyze',
        400
      );
    }

    const textContent = docContent.textContent;
    const truncatedContent =
      textContent.length > MAX_ANALYSIS_CHARS
        ? textContent.slice(0, MAX_ANALYSIS_CHARS)
        : textContent;

    const result: AnalysisResponse = {
      documentId,
      analyzedAt: new Date().toISOString(),
    };

    // Run analyses in parallel where possible
    const promises: Promise<void>[] = [];

    if (analysisTypes.includes('keywords')) {
      promises.push(
        this.extractKeywordsInternal(userId, truncatedContent, { maxItems: maxKeywords, language })
          .then((keywords) => {
            result.keywords = keywords;
          })
          .catch((err) => {
            logger.warn({ err }, 'Keyword extraction failed');
          })
      );
    }

    if (analysisTypes.includes('entities')) {
      promises.push(
        this.extractEntitiesInternal(userId, truncatedContent, { maxItems: maxEntities, language })
          .then((entities) => {
            result.entities = entities;
          })
          .catch((err) => {
            logger.warn({ err }, 'Entity extraction failed');
          })
      );
    }

    if (analysisTypes.includes('topics')) {
      promises.push(
        this.identifyTopicsInternal(userId, truncatedContent, { maxItems: maxTopics, language })
          .then((topics) => {
            result.topics = topics;
          })
          .catch((err) => {
            logger.warn({ err }, 'Topic identification failed');
          })
      );
    }

    if (analysisTypes.includes('structure')) {
      // Structure analysis is synchronous (no LLM call)
      result.structure = this.analyzeStructure(textContent);
    }

    await Promise.all(promises);

    logger.info(
      { documentId, userId, durationMs: Date.now() - startTime },
      'Document analysis completed'
    );

    return result;
  },

  /**
   * Extract keywords from document
   */
  async extractKeywords(
    userId: string,
    documentId: string,
    options: { maxKeywords?: number; language?: string } = {}
  ): Promise<KeywordsResponse> {
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to analyze',
        400
      );
    }

    const textContent = docContent.textContent;
    const truncatedContent =
      textContent.length > MAX_ANALYSIS_CHARS
        ? textContent.slice(0, MAX_ANALYSIS_CHARS)
        : textContent;

    const keywords = await this.extractKeywordsInternal(userId, truncatedContent, {
      maxItems: options.maxKeywords,
      language: options.language,
    });

    return { keywords };
  },

  /**
   * Extract entities from document
   */
  async extractEntities(
    userId: string,
    documentId: string,
    options: { maxEntities?: number; language?: string } = {}
  ): Promise<EntitiesResponse> {
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to analyze',
        400
      );
    }

    const textContent = docContent.textContent;
    const truncatedContent =
      textContent.length > MAX_ANALYSIS_CHARS
        ? textContent.slice(0, MAX_ANALYSIS_CHARS)
        : textContent;

    const entities = await this.extractEntitiesInternal(userId, truncatedContent, {
      maxItems: options.maxEntities,
      language: options.language,
    });

    return { entities };
  },

  /**
   * Get document structure (pure computation, no LLM)
   */
  async getStructure(userId: string, documentId: string): Promise<StructureResponse> {
    const docContent = await documentContentService.getContent(documentId, userId);

    if (!docContent.textContent || docContent.textContent.trim().length === 0) {
      throw Errors.auth(
        DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
        'Document has no text content to analyze',
        400
      );
    }

    const structure = this.analyzeStructure(docContent.textContent);
    return { structure };
  },

  /**
   * Analyze document structure (pure computation, no LLM call)
   */
  analyzeStructure(content: string): DocumentStructure {
    const characterCount = content.length;
    const wordCount = countWords(content);
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);
    const paragraphCount = paragraphs.length;
    const sentenceCount = countSentences(content);
    const headings = extractHeadings(content);

    // Average reading speed: ~200 words per minute for English, ~300-400 characters per minute for Chinese
    // Use a blended approach
    const estimatedReadingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      characterCount,
      wordCount,
      paragraphCount,
      sentenceCount,
      estimatedReadingTimeMinutes,
      headings,
    };
  },

  /**
   * Internal keyword extraction using LLM
   */
  async extractKeywordsInternal(
    userId: string,
    content: string,
    options: { maxItems?: number; language?: string } = {}
  ): Promise<Keyword[]> {
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    const systemPrompt = buildKeywordExtractionPrompt({
      maxItems: options.maxItems || 10,
      language: options.language,
    });
    const userPrompt = buildAnalysisUserPrompt(content, 'keywords', options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await provider.generate(messages, genOptions);
    const parsed = parseJsonResponse<{ keywords: Keyword[] }>(response);

    if (!parsed?.keywords) {
      logger.warn({ response }, 'Failed to parse keywords response');
      return [];
    }

    return parsed.keywords;
  },

  /**
   * Internal entity extraction using LLM
   */
  async extractEntitiesInternal(
    userId: string,
    content: string,
    options: { maxItems?: number; language?: string } = {}
  ): Promise<Entity[]> {
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    const systemPrompt = buildEntityExtractionPrompt({
      maxItems: options.maxItems || 20,
      language: options.language,
    });
    const userPrompt = buildAnalysisUserPrompt(content, 'entities', options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await provider.generate(messages, genOptions);
    const parsed = parseJsonResponse<{ entities: Entity[] }>(response);

    if (!parsed?.entities) {
      logger.warn({ response }, 'Failed to parse entities response');
      return [];
    }

    return parsed.entities;
  },

  /**
   * Internal topic identification using LLM
   */
  async identifyTopicsInternal(
    userId: string,
    content: string,
    options: { maxItems?: number; language?: string } = {}
  ): Promise<Topic[]> {
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    const systemPrompt = buildTopicIdentificationPrompt({
      maxItems: options.maxItems || 5,
      language: options.language,
    });
    const userPrompt = buildAnalysisUserPrompt(content, 'topics', options.language);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await provider.generate(messages, genOptions);
    const parsed = parseJsonResponse<{ topics: Topic[] }>(response);

    if (!parsed?.topics) {
      logger.warn({ response }, 'Failed to parse topics response');
      return [];
    }

    return parsed.topics;
  },
};

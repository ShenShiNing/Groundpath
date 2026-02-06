import { documentConfig } from '@config/env';
import { createLogger } from '@shared/logger';

const logger = createLogger('chunking.service');

export interface Chunk {
  content: string;
  chunkIndex: number;
  metadata: {
    startOffset: number;
    endOffset: number;
  };
}

export const chunkingService = {
  chunkText(text: string): Chunk[] {
    const chunkSize = documentConfig.chunkSize;
    const overlap = documentConfig.chunkOverlap;

    if (!text || text.trim().length === 0) {
      return [];
    }

    // Normalize whitespace
    const normalized = text.replace(/\r\n/g, '\n');

    // Split into paragraphs first for natural boundaries
    const paragraphs = normalized.split(/\n\n+/);
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;
    let offset = 0;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        offset += paragraph.length + 2; // account for \n\n
        continue;
      }

      // If adding this paragraph would exceed chunk size
      if (currentChunk.length > 0 && currentChunk.length + trimmed.length + 1 > chunkSize) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex,
          metadata: {
            startOffset: currentStart,
            endOffset: currentStart + currentChunk.length,
          },
        });
        chunkIndex++;

        // Handle overlap: keep the tail of the current chunk
        if (overlap > 0 && currentChunk.length > overlap) {
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + ' ' + trimmed;
          currentStart = Math.max(0, offset - overlap);
        } else {
          currentChunk = trimmed;
          currentStart = offset;
        }
      } else {
        if (currentChunk.length === 0) {
          currentStart = offset;
          currentChunk = trimmed;
        } else {
          currentChunk += '\n\n' + trimmed;
        }
      }

      offset += paragraph.length + 2;

      // If a single paragraph is larger than chunk size, split by sentences
      if (currentChunk.length > chunkSize) {
        const sentenceChunks = this.splitLongChunk(
          currentChunk,
          chunkSize,
          overlap,
          currentStart,
          chunkIndex
        );
        for (const sc of sentenceChunks.slice(0, -1)) {
          chunks.push(sc);
          chunkIndex++;
        }
        // Keep the last piece as the continuing chunk
        const last = sentenceChunks[sentenceChunks.length - 1];
        if (last) {
          currentChunk = last.content;
          currentStart = last.metadata.startOffset;
          chunkIndex = last.chunkIndex;
        }
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex,
        metadata: {
          startOffset: currentStart,
          endOffset: currentStart + currentChunk.length,
        },
      });
    }

    logger.debug({ totalChunks: chunks.length, textLength: text.length }, 'Text chunked');
    return chunks;
  },

  splitLongChunk(
    text: string,
    chunkSize: number,
    overlap: number,
    baseOffset: number,
    baseIndex: number
  ): Chunk[] {
    // Split by sentence boundaries
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]?\s*/g) || [text];
    const chunks: Chunk[] = [];
    let current = '';
    let currentStart = baseOffset;
    let index = baseIndex;
    let sentenceOffset = 0;

    for (const sentence of sentences) {
      if (current.length > 0 && current.length + sentence.length > chunkSize) {
        chunks.push({
          content: current.trim(),
          chunkIndex: index,
          metadata: {
            startOffset: currentStart,
            endOffset: currentStart + current.length,
          },
        });
        index++;

        if (overlap > 0 && current.length > overlap) {
          const overlapText = current.slice(-overlap);
          current = overlapText + sentence;
          currentStart = Math.max(0, baseOffset + sentenceOffset - overlap);
        } else {
          current = sentence;
          currentStart = baseOffset + sentenceOffset;
        }
      } else {
        if (current.length === 0) {
          currentStart = baseOffset + sentenceOffset;
        }
        current += sentence;
      }

      sentenceOffset += sentence.length;
    }

    if (current.trim().length > 0) {
      chunks.push({
        content: current.trim(),
        chunkIndex: index,
        metadata: {
          startOffset: currentStart,
          endOffset: currentStart + current.length,
        },
      });
    }

    return chunks;
  },
};

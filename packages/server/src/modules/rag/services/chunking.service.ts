import { documentConfig } from '@config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';

const logger = createLogger('chunking.service');
const SENTENCE_BOUNDARY_CHARS = new Set(['.', '!', '?', '。', '！', '？']);
const SENTENCE_CLOSERS = new Set(['"', "'", ')', ']', '}', '”', '’', '」', '』']);
const MIN_BOUNDARY_RATIO = 0.5;

export interface Chunk {
  content: string;
  chunkIndex: number;
  metadata: {
    startOffset: number;
    endOffset: number;
  };
}

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/u.test(char);
}

function skipLeadingWhitespace(text: string, index: number): number {
  let next = index;
  while (next < text.length && isWhitespace(text[next])) {
    next++;
  }
  return next;
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } {
  let trimmedStart = start;
  let trimmedEnd = end;

  while (trimmedStart < trimmedEnd && isWhitespace(text[trimmedStart])) {
    trimmedStart++;
  }

  while (trimmedEnd > trimmedStart && isWhitespace(text[trimmedEnd - 1])) {
    trimmedEnd--;
  }

  return { start: trimmedStart, end: trimmedEnd };
}

function findLastParagraphBreak(text: string, minEnd: number, maxEnd: number): number | null {
  let match = text.lastIndexOf('\n\n', maxEnd - 1);

  while (match >= minEnd) {
    if (text[match - 1] !== '\n') {
      return match;
    }
    match = text.lastIndexOf('\n\n', match - 1);
  }

  return null;
}

function findLastSentenceBreak(text: string, minEnd: number, maxEnd: number): number | null {
  for (let index = maxEnd - 1; index >= minEnd; index--) {
    const char = text[index];
    if (!char || !SENTENCE_BOUNDARY_CHARS.has(char)) {
      continue;
    }

    let boundary = index + 1;
    while (boundary < maxEnd && SENTENCE_CLOSERS.has(text[boundary] ?? '')) {
      boundary++;
    }

    return boundary;
  }

  return null;
}

function findLastWhitespaceBreak(text: string, minEnd: number, maxEnd: number): number | null {
  for (let index = maxEnd - 1; index >= minEnd; index--) {
    if (isWhitespace(text[index])) {
      return index;
    }
  }

  return null;
}

function findChunkEnd(text: string, start: number, targetEnd: number, overlap: number): number {
  const minEnd = Math.min(
    targetEnd,
    start + Math.max(Math.floor((targetEnd - start) * MIN_BOUNDARY_RATIO), overlap + 1)
  );

  return (
    findLastParagraphBreak(text, minEnd, targetEnd) ??
    findLastSentenceBreak(text, minEnd, targetEnd) ??
    findLastWhitespaceBreak(text, minEnd, targetEnd) ??
    targetEnd
  );
}

function createChunk(text: string, chunkIndex: number, start: number, end: number): Chunk | null {
  const trimmed = trimRange(text, start, end);
  if (trimmed.start >= trimmed.end) {
    return null;
  }

  return {
    content: text.slice(trimmed.start, trimmed.end),
    chunkIndex,
    metadata: {
      startOffset: trimmed.start,
      endOffset: trimmed.end,
    },
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
    const textBytes = Buffer.byteLength(normalized, 'utf8');

    if (textBytes > documentConfig.chunkingMaxTextBytes) {
      throw Errors.validation('Document text is too large to chunk safely', {
        textBytes,
        maxTextBytes: documentConfig.chunkingMaxTextBytes,
      });
    }

    const chunks: Chunk[] = [];
    let start = skipLeadingWhitespace(normalized, 0);
    let chunkIndex = 0;

    while (start < normalized.length) {
      const targetEnd = Math.min(start + chunkSize, normalized.length);
      const rawEnd =
        targetEnd === normalized.length
          ? normalized.length
          : findChunkEnd(normalized, start, targetEnd, overlap);
      const chunk = createChunk(normalized, chunkIndex, start, rawEnd);

      if (!chunk) {
        start = skipLeadingWhitespace(normalized, Math.max(rawEnd, start + 1));
        continue;
      }

      chunks.push(chunk);
      chunkIndex++;

      if (chunk.metadata.endOffset >= normalized.length) {
        break;
      }

      const chunkLength = chunk.metadata.endOffset - chunk.metadata.startOffset;
      const nextStart =
        overlap > 0 && chunkLength > overlap
          ? chunk.metadata.endOffset - overlap
          : chunk.metadata.endOffset;
      start = skipLeadingWhitespace(
        normalized,
        Math.max(nextStart, chunk.metadata.startOffset + 1)
      );
    }

    logger.debug({ totalChunks: chunks.length, textLength: text.length }, 'Text chunked');
    return chunks;
  },
};

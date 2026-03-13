import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMocks = vi.hoisted(() => ({
  documentConfig: {
    chunkSize: 32,
    chunkOverlap: 0,
    chunkingMaxTextBytes: 1_024,
  },
}));

vi.mock('@config/env', () => envMocks);

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
  })),
}));

import { chunkingService } from '@modules/rag/services/chunking.service';

describe('chunkingService', () => {
  beforeEach(() => {
    envMocks.documentConfig.chunkSize = 32;
    envMocks.documentConfig.chunkOverlap = 0;
    envMocks.documentConfig.chunkingMaxTextBytes = 1_024;
  });

  it('returns no chunks for empty content', () => {
    expect(chunkingService.chunkText('   ')).toEqual([]);
  });

  it('tracks paragraph offsets without assuming exactly two newline separators', () => {
    envMocks.documentConfig.chunkSize = 6;

    expect(chunkingService.chunkText('Alpha\n\n\nBeta')).toEqual([
      {
        content: 'Alpha',
        chunkIndex: 0,
        metadata: {
          startOffset: 0,
          endOffset: 5,
        },
      },
      {
        content: 'Beta',
        chunkIndex: 1,
        metadata: {
          startOffset: 8,
          endOffset: 12,
        },
      },
    ]);
  });

  it('uses a sliding window for long uninterrupted text', () => {
    envMocks.documentConfig.chunkSize = 50;
    envMocks.documentConfig.chunkOverlap = 10;

    const chunks = chunkingService.chunkText('a'.repeat(120));

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.metadata.startOffset)).toEqual([0, 40, 80]);
    expect(chunks.map((chunk) => chunk.metadata.endOffset)).toEqual([50, 90, 120]);
  });

  it('rejects oversized text before chunking', () => {
    envMocks.documentConfig.chunkingMaxTextBytes = 16;

    expect(() => chunkingService.chunkText('你'.repeat(10))).toThrow(
      'Document text is too large to chunk safely'
    );
  });
});

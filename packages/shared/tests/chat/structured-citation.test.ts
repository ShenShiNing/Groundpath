import { describe, expect, it } from 'vitest';
import { citationSchema, messageMetadataSchema } from '../../src/schemas/chat';

describe('structured citation schema', () => {
  it('accepts legacy chunk citations with structured fields', () => {
    const result = citationSchema.safeParse({
      sourceType: 'chunk',
      documentId: 'doc-1',
      documentTitle: 'Handbook',
      chunkIndex: 2,
      content: 'Legacy chunk excerpt',
      excerpt: 'Legacy chunk excerpt',
      pageNumber: 12,
      pageStart: 12,
      pageEnd: 12,
      locator: 'p.12',
      score: 0.87,
    });

    expect(result.success).toBe(true);
  });

  it('accepts node citations with section path and locator', () => {
    const result = citationSchema.safeParse({
      sourceType: 'node',
      documentId: 'doc-2',
      documentTitle: 'Architecture Guide',
      nodeId: 'node-3-2',
      documentVersion: 4,
      indexVersion: 'idx-20260309',
      sectionPath: ['Chapter 3', '3.2 Retrieval Flow'],
      pageStart: 42,
      pageEnd: 45,
      locator: 'Chapter 3 / p.42-45',
      excerpt: 'Node-based evidence excerpt',
      score: 0.91,
    });

    expect(result.success).toBe(true);
  });

  it('rejects node citations without excerpt', () => {
    const result = citationSchema.safeParse({
      sourceType: 'node',
      documentId: 'doc-2',
      documentTitle: 'Architecture Guide',
      nodeId: 'node-3-2',
    });

    expect(result.success).toBe(false);
  });
});

describe('message metadata schema', () => {
  it('supports retrievedSources, finalCitations and stopReason together', () => {
    const result = messageMetadataSchema.safeParse({
      retrievedSources: [
        {
          sourceType: 'chunk',
          documentId: 'doc-1',
          documentTitle: 'Handbook',
          chunkIndex: 0,
          content: 'retrieved',
        },
      ],
      finalCitations: [
        {
          sourceType: 'node',
          documentId: 'doc-2',
          documentTitle: 'Architecture Guide',
          nodeId: 'node-1',
          excerpt: 'final evidence',
        },
      ],
      stopReason: 'answered',
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    });

    expect(result.success).toBe(true);
  });
});

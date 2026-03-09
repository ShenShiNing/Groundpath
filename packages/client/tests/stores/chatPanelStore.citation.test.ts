import { describe, expect, it } from 'vitest';
import {
  getCitationLocatorText,
  getCitationPageLabel,
  getCitationPreviewText,
  toStoreCitation,
} from '@/stores/chatPanelStore.types';

describe('chatPanelStore citation helpers', () => {
  it('preserves chunk citation compatibility fields', () => {
    const citation = toStoreCitation(
      {
        sourceType: 'chunk',
        documentId: 'doc-1',
        documentTitle: 'Legacy Doc',
        chunkIndex: 1,
        content: 'Chunk preview',
        pageNumber: 8,
      },
      0
    );

    expect(citation.id).toBe('cit-0');
    expect(citation.excerpt).toBe('Chunk preview');
    expect(getCitationPageLabel(citation)).toBe('p.8');
    expect(getCitationPreviewText(citation)).toBe('Chunk preview');
  });

  it('normalizes node citations for UI display', () => {
    const citation = toStoreCitation(
      {
        sourceType: 'node',
        documentId: 'doc-2',
        documentTitle: 'Structured Doc',
        nodeId: 'node-1',
        sectionPath: ['Chapter 2', '2.1 Pipeline'],
        pageStart: 14,
        pageEnd: 16,
        locator: 'Chapter 2 / p.14-16',
        excerpt: 'Node excerpt',
        documentVersion: 3,
        indexVersion: 'idx-1',
      },
      1
    );

    expect(citation.id).toBe('cit-1');
    expect(getCitationLocatorText(citation)).toBe('Chapter 2 / p.14-16');
    expect(getCitationPageLabel(citation)).toBe('p.14-16');
    expect(getCitationPreviewText(citation)).toBe('Node excerpt');
  });
});

import { describe, expect, it } from 'vitest';
import { pdfStructureParser } from '@modules/document-index/services/parsers/pdf-structure.parser';

describe('pdfStructureParser', () => {
  it('parses chapter-like headings into a structured graph', () => {
    const result = pdfStructureParser.parseTextContent(`CHAPTER 1 Retrieval

Overview text.

1.1 Query Planning

Planning text.`);

    expect(result.parserRuntime).toBe('pdf');
    expect(result.headingCount).toBeGreaterThanOrEqual(2);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: 'chapter',
          sectionPath: ['CHAPTER 1 Retrieval'],
        }),
        expect.objectContaining({
          nodeType: 'section',
          sectionPath: ['CHAPTER 1 Retrieval', 'Query Planning'],
        }),
      ])
    );
  });
});

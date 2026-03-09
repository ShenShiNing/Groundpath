import { describe, expect, it } from 'vitest';
import { docxStructureParser } from '@modules/document-index/services/parsers/docx-structure.parser';

describe('docxStructureParser', () => {
  it('parses numbered headings into a structured graph', () => {
    const result = docxStructureParser.parseTextContent(`Chapter 1 Introduction

Overview text.

1.1 Goals

Goal text.`);

    expect(result.parserRuntime).toBe('docx');
    expect(result.headingCount).toBeGreaterThanOrEqual(2);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: 'chapter',
          sectionPath: ['Chapter 1 Introduction'],
        }),
        expect.objectContaining({
          nodeType: 'section',
          sectionPath: ['Chapter 1 Introduction', '1.1 Goals'],
        }),
      ])
    );
  });

  it('extracts appendix references into graph edges', () => {
    const result = docxStructureParser.parseTextContent(`Appendix A Supporting Tables

See Appendix B for more tables.

Appendix B Extra Tables

More content.`);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          edgeType: 'refers_to',
          anchorText: 'Appendix B',
        }),
      ])
    );
  });
});

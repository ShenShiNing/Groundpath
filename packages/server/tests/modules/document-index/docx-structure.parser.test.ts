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
          sectionPath: ['Chapter 1 Introduction', 'Goals'],
        }),
      ])
    );
  });
});

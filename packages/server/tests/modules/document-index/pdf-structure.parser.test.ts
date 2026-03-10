import { describe, expect, it } from 'vitest';
import { pdfStructureParser } from '@modules/document-index/services/parsers/pdf-structure.parser';
import { parseHeuristicStructuredText } from '@modules/document-index/services/parsers/heuristic-structure.parser';

describe('pdfStructureParser', () => {
  it('parses chapter-like headings via heuristic parser', () => {
    const result = parseHeuristicStructuredText(
      `CHAPTER 1 Retrieval

Overview text.

1.1 Query Planning

Planning text.`,
      'pdf'
    );

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
          sectionPath: ['CHAPTER 1 Retrieval', '1.1 Query Planning'],
        }),
      ])
    );
  });

  it('extracts citation-like chapter references into graph edges', () => {
    const result = parseHeuristicStructuredText(
      `CHAPTER 1 Retrieval

This section cites Chapter 2 for benchmarks.

CHAPTER 2 Benchmarks

Benchmark text.`,
      'pdf'
    );

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          edgeType: 'cites',
          anchorText: 'Chapter 2',
        }),
      ])
    );
  });

  it('normalizes docling markdown before building structured nodes', () => {
    const result = pdfStructureParser.parseDoclingMarkdown(`## Demand index

124

## 1. Key findings

- Scenario A keeps total demand growth below the baseline path.

## Callout

Cross-reference check.`);

    expect(result.parserRuntime).toBe('docling');
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '1. Key findings',
          sectionPath: ['1. Key findings'],
        }),
      ])
    );
    expect(result.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Demand index' }),
        expect.objectContaining({ title: 'Callout' }),
      ])
    );
  });
});

import { describe, expect, it } from 'vitest';
import { markdownStructureParser } from '@modules/document-index/services/parsers/markdown-structure.parser';

describe('markdownStructureParser', () => {
  it('builds a root node and heading nodes with section paths', () => {
    const result = markdownStructureParser.parse(`# Chapter 1

Intro paragraph.

## Section 1.1

Section body.`);

    expect(result.parseMethod).toBe('structured');
    expect(result.parserRuntime).toBe('markdown');
    expect(result.headingCount).toBe(2);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]).toMatchObject({
      id: 'root',
      nodeType: 'document',
      orderNo: 0,
    });
    expect(result.nodes[1]).toMatchObject({
      id: 'node-1',
      parentId: 'root',
      nodeType: 'chapter',
      sectionPath: ['Chapter 1'],
      content: 'Intro paragraph.',
    });
    expect(result.nodes[2]).toMatchObject({
      id: 'node-2',
      parentId: 'node-1',
      nodeType: 'section',
      sectionPath: ['Chapter 1', 'Section 1.1'],
      content: 'Section body.',
    });
  });

  it('keeps content before the first heading on the root node', () => {
    const result = markdownStructureParser.parse(`Preface line.

# Start

Body`);

    expect(result.nodes[0]).toMatchObject({
      id: 'root',
      content: 'Preface line.',
    });
    expect(result.nodes[1]?.parentId).toBe('root');
  });

  it('creates parent and next edges for heading traversal', () => {
    const result = markdownStructureParser.parse(`# One

Text

# Two

More text`);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: 'root',
          toNodeId: 'node-1',
          edgeType: 'parent',
        }),
        expect.objectContaining({
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          edgeType: 'next',
        }),
      ])
    );
  });
});

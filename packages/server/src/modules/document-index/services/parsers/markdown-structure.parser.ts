import { documentIndexConfig } from '@config/env';
import type { ParsedDocumentEdge, ParsedDocumentNode, ParsedDocumentStructure } from './types';
import { buildReferenceEdges, inferStructuredNodeType } from './reference-edge-extractor';

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / documentIndexConfig.charsPerToken);
}

function toPreview(text: string, maxLength: number = 240): string {
  const trimmed = text.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function normalizeHeadingTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

type MutableNode = ParsedDocumentNode & {
  contentLines: string[];
};

export const markdownStructureParser = {
  parse(textContent: string): ParsedDocumentStructure {
    const lines = textContent.split(/\r?\n/);
    const nodes: MutableNode[] = [];
    const edges: ParsedDocumentEdge[] = [];

    const rootNode: MutableNode = {
      id: 'root',
      parentId: null,
      nodeType: 'document',
      title: null,
      depth: 0,
      sectionPath: [],
      orderNo: 0,
      stableLocator: 'Document',
      content: '',
      contentPreview: '',
      tokenCount: 0,
      contentLines: [],
    };

    nodes.push(rootNode);

    const stack: MutableNode[] = [rootNode];
    let currentNode = rootNode;
    let nextNodeOrder = 1;
    let headingCount = 0;
    let previousSequentialNode: MutableNode | null = null;

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (!match) {
        currentNode.contentLines.push(line);
        continue;
      }

      const headingMarks = match[1] ?? '';
      const rawTitle = match[2] ?? '';
      const depth = headingMarks.length;
      const title = normalizeHeadingTitle(rawTitle);

      while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
        stack.pop();
      }

      const parentNode = stack[stack.length - 1] ?? rootNode;
      const sectionPath = [...parentNode.sectionPath, title];
      const node: MutableNode = {
        id: `node-${nextNodeOrder}`,
        parentId: parentNode.id,
        nodeType: inferStructuredNodeType(title, depth),
        title,
        depth,
        sectionPath,
        orderNo: nextNodeOrder,
        stableLocator: sectionPath.join(' > '),
        content: '',
        contentPreview: '',
        tokenCount: 0,
        contentLines: [],
      };

      nodes.push(node);
      edges.push({
        fromNodeId: parentNode.id,
        toNodeId: node.id,
        edgeType: 'parent',
        anchorText: title,
      });
      if (previousSequentialNode) {
        edges.push({
          fromNodeId: previousSequentialNode.id,
          toNodeId: node.id,
          edgeType: 'next',
        });
      }

      stack.push(node);
      currentNode = node;
      previousSequentialNode = node;
      nextNodeOrder += 1;
      headingCount += 1;
    }

    const finalizedNodes: ParsedDocumentNode[] = nodes.map((node) => {
      const content = node.contentLines.join('\n').trim();
      return {
        id: node.id,
        parentId: node.parentId,
        nodeType: node.nodeType,
        title: node.title,
        depth: node.depth,
        sectionPath: node.sectionPath,
        orderNo: node.orderNo,
        stableLocator: node.stableLocator,
        content,
        contentPreview: toPreview(content),
        tokenCount: estimateTokens(content),
      };
    });

    return {
      nodes: finalizedNodes,
      edges: [...edges, ...buildReferenceEdges(finalizedNodes)],
      parseMethod: 'structured',
      parserRuntime: 'markdown',
      headingCount,
    };
  },
};

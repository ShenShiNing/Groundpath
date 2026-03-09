import type { ParsedDocumentEdge, ParsedDocumentNode, ParsedNodeType } from './types';
import { markFrontMatterNodes } from './front-matter';

function splitBlocks(content: string): string[] {
  if (!content.trim()) return [];
  return content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function joinBlocks(blocks: string[]): string {
  return blocks
    .filter((block) => block.trim().length > 0)
    .join('\n\n')
    .trim();
}

function isMarkdownTableBlock(block: string): boolean {
  const lines = block.split('\n').map((line) => line.trim());
  return (
    lines.length >= 2 &&
    /^\|.*\|$/.test(lines[0] ?? '') &&
    /^\|\s*[:\-| ]+\|\s*$/.test(lines[1] ?? '')
  );
}

function isFigureCaptionBlock(block: string): boolean {
  return /^(figure|fig\.?|图)\s+[A-Z]?\d+(?:[-.]\d+)?/iu.test(block.trim());
}

function isTableCaptionBlock(block: string): boolean {
  return /^(table|表)\s+[A-Z]?\d+(?:[-.]\d+)?/iu.test(block.trim());
}

function isImagePlaceholderBlock(block: string): boolean {
  return block.trim() === '<!-- image -->';
}

function extractAppendixLines(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(appendix|附录)\s+[A-Z0-9一二三四五六七八九十百零\d]+/iu.test(line));
}

function inferChildNodeType(title: string): ParsedNodeType {
  const normalized = title.trim().toLowerCase();
  if (/^(appendix|附录)\b/u.test(normalized)) return 'appendix';
  if (/^(table|表)\b/u.test(normalized)) return 'table';
  if (/^(figure|fig\.?|图)\b/u.test(normalized)) return 'figure';
  return 'paragraph';
}

function toPreview(text: string, maxLength: number = 240): string {
  const trimmed = text.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function createChildNode(
  parent: ParsedDocumentNode,
  id: string,
  title: string,
  content: string,
  childIndex: number,
  depthOffset: number = 1
): ParsedDocumentNode {
  const sectionPath = [...parent.sectionPath, title];
  const trimmedContent = content.trim();
  return {
    id,
    parentId: parent.id,
    nodeType: inferChildNodeType(title),
    title,
    depth: parent.depth + depthOffset,
    sectionPath,
    orderNo: parent.orderNo + childIndex,
    stableLocator: sectionPath.join(' > '),
    content: trimmedContent,
    contentPreview: toPreview(trimmedContent || title),
    tokenCount: Math.ceil((trimmedContent || title).length / 4),
  };
}

function expandNode(node: ParsedDocumentNode): ParsedDocumentNode[] {
  if (node.nodeType === 'document' || !node.content.trim()) return [node];

  const blocks = splitBlocks(node.content);
  if (blocks.length === 0) return [node];

  const keptBlocks: string[] = [];
  const childNodes: ParsedDocumentNode[] = [];
  let childIndex = 1;

  for (const block of blocks) {
    if (isMarkdownTableBlock(block)) {
      const previousBlock = keptBlocks.at(-1)?.trim();
      const title =
        previousBlock && isTableCaptionBlock(previousBlock)
          ? (keptBlocks.pop() ?? previousBlock)
          : `Table ${childIndex}`;
      childNodes.push(
        createChildNode(node, `${node.id}::table:${childIndex}`, title.trim(), block, childIndex)
      );
      childIndex += 1;
      continue;
    }

    if (isImagePlaceholderBlock(block)) {
      const previousBlock = keptBlocks.at(-1)?.trim();
      const title =
        previousBlock && isFigureCaptionBlock(previousBlock)
          ? (keptBlocks.pop() ?? previousBlock)
          : `Figure ${childIndex}`;
      childNodes.push(
        createChildNode(
          node,
          `${node.id}::figure:${childIndex}`,
          title.trim(),
          `${title.trim()}\n\n${block}`,
          childIndex
        )
      );
      childIndex += 1;
      continue;
    }

    const appendixLines = extractAppendixLines(block);
    if (
      appendixLines.length > 0 &&
      appendixLines.length ===
        block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean).length
    ) {
      for (const appendixLine of appendixLines) {
        childNodes.push(
          createChildNode(
            node,
            `${node.id}::appendix:${childIndex}`,
            appendixLine,
            appendixLine,
            childIndex
          )
        );
        childIndex += 1;
      }
      continue;
    }

    keptBlocks.push(block);
  }

  const updatedNode: ParsedDocumentNode = {
    ...node,
    content: joinBlocks(keptBlocks),
    contentPreview: toPreview(joinBlocks(keptBlocks) || node.title || ''),
    tokenCount: Math.ceil((joinBlocks(keptBlocks) || node.title || '').length / 4),
  };

  return [updatedNode, ...childNodes];
}

function rebuildStructuralEdges(nodes: ParsedDocumentNode[]): ParsedDocumentEdge[] {
  const edges: ParsedDocumentEdge[] = [];
  const sortedNodes = [...nodes].sort((a, b) => a.orderNo - b.orderNo);
  const contentNodes = sortedNodes.filter((node) => node.nodeType !== 'document');

  for (const node of sortedNodes) {
    if (node.parentId) {
      edges.push({
        fromNodeId: node.parentId,
        toNodeId: node.id,
        edgeType: 'parent',
        anchorText: node.title ?? undefined,
      });
    }
  }

  for (let index = 1; index < contentNodes.length; index += 1) {
    edges.push({
      fromNodeId: contentNodes[index - 1]!.id,
      toNodeId: contentNodes[index]!.id,
      edgeType: 'next',
    });
  }

  return edges;
}

export function buildStructuredContentNodes(nodes: ParsedDocumentNode[]): {
  nodes: ParsedDocumentNode[];
  edges: ParsedDocumentEdge[];
} {
  const expanded = nodes.flatMap(expandNode);
  const frontMatterMarked = markFrontMatterNodes(expanded);
  const reordered = frontMatterMarked.map((node, index) => ({
    ...node,
    orderNo: index,
  }));

  return {
    nodes: reordered,
    edges: rebuildStructuralEdges(reordered),
  };
}

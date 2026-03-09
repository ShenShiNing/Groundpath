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

function isExplicitHeading(line: string): { level: number; title: string } | null {
  const numbered = line.match(/^(\d+(?:\.\d+){0,5})[.)]?\s+(.{1,160})$/);
  if (numbered) {
    const segments = (numbered[1] ?? '').split('.').length;
    return {
      level: Math.min(Math.max(segments, 1), 6),
      title: (numbered[2] ?? '').trim(),
    };
  }

  const chapter = line.match(
    /^(chapter\s+\d+|appendix\s+[A-Z0-9]+|第[一二三四五六七八九十百零\d]+章|附录\s*[A-Z0-9一二三四五六七八九十百零\d]*)[:：]?\s*(.*)$/i
  );
  if (chapter) {
    const prefix = (chapter[1] ?? '').trim();
    const suffix = (chapter[2] ?? '').trim();
    return {
      level: 1,
      title: suffix ? `${prefix} ${suffix}`.trim() : prefix,
    };
  }

  return null;
}

function isStandaloneHeading(
  line: string,
  previousLine: string | undefined,
  nextLine: string | undefined
) {
  const normalized = line.trim();
  if (!normalized || normalized.length > 120) return false;
  if (/[.?!。！？；;:]$/.test(normalized)) return false;
  if (normalized.split(/\s+/).length > 12) return false;
  if (previousLine?.trim()) return false;
  if (nextLine?.trim()) return false;
  return true;
}

type MutableNode = ParsedDocumentNode & {
  contentLines: string[];
};

export function parseHeuristicStructuredText(
  textContent: string,
  parserRuntime: string
): ParsedDocumentStructure {
  const rawLines = textContent.split(/\r?\n/);
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

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index] ?? '';
    const line = rawLine.trim();

    if (!line) {
      currentNode.contentLines.push('');
      continue;
    }

    const explicitHeading = isExplicitHeading(line);
    const implicitHeading = isStandaloneHeading(line, rawLines[index - 1], rawLines[index + 1])
      ? { level: 2, title: line }
      : null;
    const heading = explicitHeading ?? implicitHeading;

    if (!heading) {
      currentNode.contentLines.push(line);
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= heading.level) {
      stack.pop();
    }

    const parentNode = stack[stack.length - 1] ?? rootNode;
    const sectionPath = [...parentNode.sectionPath, heading.title];
    const node: MutableNode = {
      id: `node-${nextNodeOrder}`,
      parentId: parentNode.id,
      nodeType: inferStructuredNodeType(heading.title, heading.level),
      title: heading.title,
      depth: heading.level,
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
      anchorText: heading.title,
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
    headingCount += 1;
    nextNodeOrder += 1;
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
    parserRuntime,
    headingCount,
  };
}

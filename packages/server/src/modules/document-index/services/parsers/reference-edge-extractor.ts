import type { ParsedDocumentEdge, ParsedDocumentNode, ParsedNodeType } from './types';

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function classifyNodeType(title: string, depth: number): ParsedNodeType {
  const normalized = normalizeText(title);
  if (/^(appendix|附录)\b/u.test(normalized)) return 'appendix';
  if (/^(table|表)\b/u.test(normalized)) return 'table';
  if (/^(figure|图)\b/u.test(normalized)) return 'figure';
  return depth === 1 ? 'chapter' : 'section';
}

function buildAliases(node: ParsedDocumentNode): string[] {
  const aliases = new Set<string>();
  const title = node.title ?? '';
  const normalizedTitle = normalizeText(title);
  if (normalizedTitle) aliases.add(normalizedTitle);

  const lastSection = node.sectionPath.at(-1);
  if (lastSection) aliases.add(normalizeText(lastSection));
  if (node.stableLocator) aliases.add(normalizeText(node.stableLocator));

  const numberedMatch = title.match(/^(?:section\s+)?(\d+(?:\.\d+)*)\b/i);
  if (numberedMatch?.[1]) {
    aliases.add(numberedMatch[1].toLowerCase());
    aliases.add(`section ${numberedMatch[1].toLowerCase()}`);
  }

  const appendixMatch = title.match(/^(?:appendix|附录)\s*([A-Z0-9一二三四五六七八九十百零\d]+)/iu);
  if (appendixMatch?.[1]) {
    const appendixId = appendixMatch[1].toLowerCase();
    aliases.add(`appendix ${appendixId}`);
    aliases.add(`附录 ${appendixId}`);
  }

  const chapterEnglishMatch = title.match(/^chapter\s+(\d+)/i);
  if (chapterEnglishMatch?.[1]) {
    aliases.add(`chapter ${chapterEnglishMatch[1]}`);
  }

  const chapterChineseMatch = title.match(/^(第\s*[一二三四五六七八九十百零\d]+\s*章)/u);
  if (chapterChineseMatch?.[1]) {
    aliases.add(normalizeText(chapterChineseMatch[1]));
  }

  return [...aliases];
}

function resolveReferenceTarget(
  referenceLabel: string,
  aliasMap: Map<string, ParsedDocumentNode[]>
): ParsedDocumentNode | null {
  const normalized = normalizeText(referenceLabel);
  const matches = aliasMap.get(normalized);
  return matches?.[0] ?? null;
}

export function buildReferenceEdges(nodes: ParsedDocumentNode[]): ParsedDocumentEdge[] {
  const aliasMap = new Map<string, ParsedDocumentNode[]>();
  for (const node of nodes) {
    for (const alias of buildAliases(node)) {
      const matches = aliasMap.get(alias) ?? [];
      matches.push(node);
      aliasMap.set(alias, matches);
    }
  }

  const edges = new Map<string, ParsedDocumentEdge>();

  const explicitPatterns: Array<{
    pattern: RegExp;
    edgeType: ParsedDocumentEdge['edgeType'];
  }> = [
    {
      pattern:
        /\b(cite|cites|cited|citing)\s+(chapter\s+\d+|section\s+\d+(?:\.\d+)*|appendix\s+[a-z0-9]+)\b/gi,
      edgeType: 'cites',
    },
    {
      pattern:
        /\b(see|refer to|refers to|described in|described at)\s+(chapter\s+\d+|section\s+\d+(?:\.\d+)*|appendix\s+[a-z0-9]+)\b/gi,
      edgeType: 'refers_to',
    },
    {
      pattern:
        /(见|参见|参考|详见|引用)\s*(第\s*[一二三四五六七八九十百零\d]+\s*章|附录\s*[A-Z0-9一二三四五六七八九十百零\d]+)/giu,
      edgeType: 'refers_to',
    },
  ];

  const genericPattern =
    /\b(chapter\s+\d+|section\s+\d+(?:\.\d+)*|appendix\s+[a-z0-9]+)\b|(?:第\s*[一二三四五六七八九十百零\d]+\s*章|附录\s*[A-Z0-9一二三四五六七八九十百零\d]+)/giu;

  for (const node of nodes) {
    const haystacks = [node.title ?? '', node.content];
    for (const haystack of haystacks) {
      if (!haystack.trim()) continue;

      const consumedLabels = new Set<string>();

      for (const { pattern, edgeType } of explicitPatterns) {
        for (const match of haystack.matchAll(pattern)) {
          const label = match[2] ?? match[0] ?? '';
          const target = resolveReferenceTarget(label, aliasMap);
          if (!target || target.id === node.id) continue;
          consumedLabels.add(normalizeText(label));
          const key = `${node.id}:${target.id}:${edgeType}`;
          edges.set(key, {
            fromNodeId: node.id,
            toNodeId: target.id,
            edgeType,
            anchorText: label,
          });
        }
      }

      for (const match of haystack.matchAll(genericPattern)) {
        const label = match[0] ?? '';
        const normalizedLabel = normalizeText(label);
        if (!normalizedLabel || consumedLabels.has(normalizedLabel)) continue;
        const target = resolveReferenceTarget(label, aliasMap);
        if (!target || target.id === node.id) continue;
        const key = `${node.id}:${target.id}:refers_to`;
        edges.set(key, {
          fromNodeId: node.id,
          toNodeId: target.id,
          edgeType: 'refers_to',
          anchorText: label,
        });
      }
    }
  }

  return [...edges.values()];
}

export function inferStructuredNodeType(title: string, depth: number): ParsedNodeType {
  return classifyNodeType(title, depth);
}

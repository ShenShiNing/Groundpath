import type { ParsedDocumentNode } from './types';

const FRONT_MATTER_ROOT = 'Front Matter';
const FRONT_MATTER_TITLES = new Set([
  'table of contents',
  'publication history',
  'contact information',
  'additional information',
  'nist technical series policies',
  'copyright, use, and licensing statements',
  'acknowledgments',
  'acknowledgements',
]);
const BODY_HEADING_PATTERN =
  /^(?:\d+(?:\.\d+)*|chapter\s+\d+|appendix\s+[a-z0-9]+|第\s*[一二三四五六七八九十百零\d]+\s*章|附录\s*[A-Z0-9一二三四五六七八九十百零\d]+)/iu;

function isFrontMatterTitle(title: string | null): boolean {
  if (!title) return false;
  return FRONT_MATTER_TITLES.has(title.trim().toLowerCase());
}

function isBodyHeadingTitle(title: string | null): boolean {
  if (!title) return false;
  return BODY_HEADING_PATTERN.test(title.trim());
}

function shouldInferFrontMatter(node: ParsedDocumentNode, bodyStarted: boolean): boolean {
  if (bodyStarted) return false;
  if (!node.title) return false;
  if (/^abstract$/i.test(node.title.trim())) return false;
  if (isBodyHeadingTitle(node.title)) return false;
  return node.depth <= 2;
}

export function isFrontMatterSectionPath(sectionPath?: string[] | null): boolean {
  return Array.isArray(sectionPath) && sectionPath[0] === FRONT_MATTER_ROOT;
}

export function markFrontMatterNodes(nodes: ParsedDocumentNode[]): ParsedDocumentNode[] {
  const sortedNodes = [...nodes].sort((a, b) => a.orderNo - b.orderNo);
  const frontMatterNodeIds = new Set<string>();
  let bodyStarted = false;

  for (const node of sortedNodes) {
    if (node.nodeType === 'document') continue;

    const parentIsFrontMatter = !!node.parentId && frontMatterNodeIds.has(node.parentId);
    const explicitFrontMatter = isFrontMatterTitle(node.title);
    const inferredFrontMatter = shouldInferFrontMatter(node, bodyStarted);

    if (parentIsFrontMatter || explicitFrontMatter || inferredFrontMatter) {
      frontMatterNodeIds.add(node.id);
    }

    if (isBodyHeadingTitle(node.title)) {
      bodyStarted = true;
    }
  }

  return nodes.map((node) => {
    if (!frontMatterNodeIds.has(node.id) || isFrontMatterSectionPath(node.sectionPath)) {
      return node;
    }

    const sectionPath = [FRONT_MATTER_ROOT, ...node.sectionPath];
    return {
      ...node,
      sectionPath,
      stableLocator: sectionPath.join(' > '),
    };
  });
}

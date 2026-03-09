import { isFrontMatterSectionPath } from '../parsers/front-matter';

interface LocatorInput {
  nodeType?: string | null;
  stableLocator: string | null;
  sectionPath: string[] | null;
  title: string | null;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
}

interface ExcerptInput {
  nodeType?: string | null;
  title: string | null;
  locator?: string;
  sectionPath?: string[] | null;
  content?: string | null;
  contentPreview?: string | null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).replace(/\s*:\s*/g, ': ');
}

function formatPageSuffix(pageStart: number | null, pageEnd: number | null): string | null {
  if (pageStart && pageEnd) {
    return pageStart === pageEnd ? `p.${pageStart}` : `p.${pageStart}-${pageEnd}`;
  }
  if (pageStart) return `p.${pageStart}`;
  if (pageEnd) return `p.${pageEnd}`;
  return null;
}

function extractTableHeader(text?: string | null): string | null {
  if (!text) return null;
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('|') && item.endsWith('|'));
  if (!line) return null;
  const cells = line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => normalizeWhitespace(cell))
    .filter(Boolean);
  if (cells.length === 0) return null;
  return cells.join(' | ');
}

export function buildNodeLocator(input: LocatorInput): string {
  const base =
    input.stableLocator || input.sectionPath?.join(' > ') || input.title || input.documentTitle;
  const cleanedBase = normalizeLabel(base);
  const pageSuffix = formatPageSuffix(input.pageStart, input.pageEnd);
  return pageSuffix ? `${cleanedBase} / ${pageSuffix}` : cleanedBase;
}

export function buildNodeExcerpt(input: ExcerptInput): string {
  const title = input.title ? normalizeLabel(input.title) : null;
  const preview = input.contentPreview ? normalizeWhitespace(input.contentPreview) : null;
  const content = input.content ? normalizeWhitespace(input.content) : null;

  if (input.nodeType === 'figure') {
    return title ?? preview ?? input.locator ?? 'Figure';
  }

  if (input.nodeType === 'table') {
    const header = extractTableHeader(input.contentPreview ?? input.content);
    if (title && header) return `${title}: ${header}`;
    return title ?? header ?? preview ?? input.locator ?? 'Table';
  }

  if (input.nodeType === 'appendix') {
    return title ?? preview ?? input.locator ?? 'Appendix';
  }

  if (isFrontMatterSectionPath(input.sectionPath)) {
    return title ?? preview ?? content ?? input.locator ?? '';
  }

  return preview ?? content ?? title ?? input.locator ?? '';
}

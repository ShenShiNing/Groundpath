import type { DocumentListItem } from '@groundpath/shared/types';

export function findFirstMatchingTextElement(
  container: HTMLElement,
  keyword: string
): HTMLElement | null {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  if (!normalizedKeyword) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_SKIP;
      return text.toLocaleLowerCase().includes(normalizedKeyword)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  const firstMatch = walker.nextNode();
  return firstMatch instanceof Text ? firstMatch.parentElement : null;
}

export function getSearchableDocuments(documents: DocumentListItem[]): DocumentListItem[] {
  return documents.filter((document) => document.processingStatus === 'completed');
}

export function getProcessingDocumentCount(documents: DocumentListItem[]): number {
  return documents.filter(
    (document) =>
      document.processingStatus === 'pending' || document.processingStatus === 'processing'
  ).length;
}

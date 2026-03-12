import type { DocumentListItem, KnowledgeBaseListItem } from '@knowledge-agent/shared/types';

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

export function getPreferredKnowledgeBaseId(
  knowledgeBases: KnowledgeBaseListItem[]
): string | undefined {
  if (knowledgeBases.length === 0) return undefined;

  const sortedByUpdated = [...knowledgeBases].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return sortedByUpdated.find((kb) => kb.documentCount > 0)?.id ?? sortedByUpdated[0]?.id;
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

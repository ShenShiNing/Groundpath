import { documentIndexConfig } from '@config/env';
import { documentStorageService } from '@modules/document/services/document-storage.service';
import { markdownStructureParser } from './markdown-structure.parser';
import { normalizeDoclingMarkdown } from './docling-markdown-normalizer';
import { parseHeuristicStructuredText } from './heuristic-structure.parser';
import { extractStructuredPdfText } from './pdf-parser.runtime';

export const pdfStructureParser = {
  parseTextContent(textContent: string, parserRuntime: string = 'pdf') {
    return parseHeuristicStructuredText(textContent, parserRuntime);
  },

  parseDoclingMarkdown(markdownContent: string) {
    const normalizedMarkdown = normalizeDoclingMarkdown(markdownContent);
    return markdownStructureParser.parse(normalizedMarkdown, 'docling');
  },

  async parseFromStorage(storageKey: string) {
    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const textContent = await extractStructuredPdfText(buffer);
    const parsed =
      documentIndexConfig.pdfRuntime === 'docling'
        ? this.parseDoclingMarkdown(textContent)
        : this.parseTextContent(textContent, documentIndexConfig.pdfRuntime);

    return {
      ...parsed,
      parserRuntime: documentIndexConfig.pdfRuntime,
    };
  },
};

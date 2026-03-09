import { documentIndexConfig } from '@config/env';
import { documentStorageService } from '@modules/document/services/document-storage.service';
import { parseHeuristicStructuredText } from './heuristic-structure.parser';
import { extractStructuredPdfText } from './pdf-parser.runtime';

export const pdfStructureParser = {
  parseTextContent(textContent: string) {
    return parseHeuristicStructuredText(textContent, 'pdf');
  },

  async parseFromStorage(storageKey: string) {
    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const textContent = await extractStructuredPdfText(buffer);
    const parsed = this.parseTextContent(textContent);

    return {
      ...parsed,
      parserRuntime: documentIndexConfig.pdfRuntime,
    };
  },
};

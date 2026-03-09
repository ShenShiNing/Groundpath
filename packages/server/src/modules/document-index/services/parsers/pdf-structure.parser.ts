import { PDFParse } from 'pdf-parse';
import { documentStorageService } from '@modules/document/services/document-storage.service';
import { parseHeuristicStructuredText } from './heuristic-structure.parser';

export const pdfStructureParser = {
  parseTextContent(textContent: string) {
    return parseHeuristicStructuredText(textContent, 'pdf');
  },

  async parseFromStorage(storageKey: string) {
    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return this.parseTextContent(result.text || '');
    } finally {
      await parser.destroy();
    }
  },
};

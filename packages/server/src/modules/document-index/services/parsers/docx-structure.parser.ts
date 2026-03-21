import mammoth from 'mammoth';
import { documentStorageService } from '@modules/document/public/storage';
import { parseHeuristicStructuredText } from './heuristic-structure.parser';

export const docxStructureParser = {
  parseTextContent(textContent: string) {
    return parseHeuristicStructuredText(textContent, 'docx');
  },

  async parseFromStorage(storageKey: string) {
    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const result = await mammoth.extractRawText({ buffer });
    return this.parseTextContent(result.value || '');
  },
};

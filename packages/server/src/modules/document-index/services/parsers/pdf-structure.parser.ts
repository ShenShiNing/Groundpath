import { featureFlags } from '@config/env';
import { documentStorageService } from '@modules/document/public/storage';
import { markdownStructureParser } from './markdown-structure.parser';
import { normalizeDoclingMarkdown } from './docling-markdown-normalizer';
import { extractStructuredPdfText, extractStructuredPdfWithImages } from './pdf-parser.runtime';
import type { ParsedDocumentStructure } from './types';

export const pdfStructureParser = {
  parseDoclingMarkdown(markdownContent: string) {
    const normalizedMarkdown = normalizeDoclingMarkdown(markdownContent);
    return markdownStructureParser.parse(normalizedMarkdown, 'docling');
  },

  async parseFromStorage(storageKey: string) {
    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const textContent = await extractStructuredPdfText(buffer);
    const parsed = this.parseDoclingMarkdown(textContent);

    return {
      ...parsed,
      parserRuntime: 'docling' as const,
    };
  },

  async parseFromStorageWithImages(storageKey: string): Promise<ParsedDocumentStructure> {
    if (!featureFlags.imageDescriptionEnabled) {
      return this.parseFromStorage(storageKey);
    }

    const buffer = await documentStorageService.getDocumentContent(storageKey);
    const { markdown, images } = await extractStructuredPdfWithImages(buffer);
    const parsed = this.parseDoclingMarkdown(markdown);

    return {
      ...parsed,
      parserRuntime: 'docling',
      extractedImages: images,
    };
  },
};

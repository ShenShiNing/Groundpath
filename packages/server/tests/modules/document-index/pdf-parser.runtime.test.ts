import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    documentIndexConfig: {
      pdfRuntime: 'pdf-parse' as 'pdf-parse' | 'marker' | 'docling',
      pdfTimeoutMs: 50,
      pdfConcurrency: 1,
    },
  },
  storageService: {
    getDocumentContent: vi.fn(),
  },
  parser: {
    getText: vi.fn(),
    destroy: vi.fn(),
  },
  PDFParse: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@modules/document/services/document-storage.service', () => ({
  documentStorageService: mocks.storageService,
}));

vi.mock('pdf-parse', () => ({
  PDFParse: mocks.PDFParse,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => mocks.logger,
}));

describe('pdfStructureParser runtime controls', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.env.documentIndexConfig.pdfRuntime = 'pdf-parse';
    mocks.env.documentIndexConfig.pdfTimeoutMs = 50;
    mocks.env.documentIndexConfig.pdfConcurrency = 1;
    mocks.storageService.getDocumentContent.mockResolvedValue(Buffer.from('fake pdf'));
    mocks.parser.destroy.mockResolvedValue(undefined);
    mocks.PDFParse.mockImplementation(function PDFParseMock() {
      return mocks.parser;
    });
  });

  it('parses stored PDFs with the configured runtime label', async () => {
    mocks.parser.getText.mockResolvedValue({
      text: `CHAPTER 1 Retrieval

Overview text.`,
    });

    const { pdfStructureParser } = await import(
      '@modules/document-index/services/parsers/pdf-structure.parser'
    );
    const result = await pdfStructureParser.parseFromStorage('documents/test.pdf');

    expect(mocks.storageService.getDocumentContent).toHaveBeenCalledWith('documents/test.pdf');
    expect(mocks.PDFParse).toHaveBeenCalledTimes(1);
    expect(result.parserRuntime).toBe('pdf-parse');
    expect(result.headingCount).toBeGreaterThanOrEqual(1);
  });

  it('classifies slow parser execution as a timeout', async () => {
    mocks.env.documentIndexConfig.pdfTimeoutMs = 5;
    mocks.parser.getText.mockImplementation(() => new Promise(() => undefined));

    const { pdfStructureParser } = await import(
      '@modules/document-index/services/parsers/pdf-structure.parser'
    );

    await expect(pdfStructureParser.parseFromStorage('documents/slow.pdf')).rejects.toMatchObject({
      name: 'PdfStructureParserRuntimeError',
      code: 'timeout',
      runtime: 'pdf-parse',
    });
    expect(mocks.parser.destroy).toHaveBeenCalledTimes(1);
  });
});

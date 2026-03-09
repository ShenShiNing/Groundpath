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
  fs: {
    access: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
  },
  spawn: vi.fn(),
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

vi.mock('node:fs/promises', () => ({
  default: mocks.fs,
  ...mocks.fs,
}));
vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
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
    mocks.fs.access.mockResolvedValue(undefined);
    mocks.fs.mkdir.mockResolvedValue(undefined);
    mocks.fs.mkdtemp.mockResolvedValue('D:\\temp\\docling-run');
    mocks.fs.writeFile.mockResolvedValue(undefined);
    mocks.fs.readFile.mockResolvedValue('## Parsed Markdown');
    mocks.fs.rm.mockResolvedValue(undefined);
    mocks.PDFParse.mockImplementation(function PDFParseMock() {
      return mocks.parser;
    });
    mocks.spawn.mockImplementation(() => {
      const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
      const stdoutHandlers: Array<(chunk: Buffer) => void> = [];
      const stderrHandlers: Array<(chunk: Buffer) => void> = [];
      queueMicrotask(() => {
        stdoutHandlers.forEach((handler) =>
          handler(Buffer.from('{"status":"ConversionStatus.SUCCESS","success":true,"errors":[]}'))
        );
        (handlers.get('close') ?? []).forEach((handler) => handler(0));
      });
      return {
        stdout: {
          on: (event: string, callback: (chunk: Buffer) => void) => {
            if (event === 'data') stdoutHandlers.push(callback);
          },
        },
        stderr: {
          on: (event: string, callback: (chunk: Buffer) => void) => {
            if (event === 'data') stderrHandlers.push(callback);
          },
        },
        on: (event: string, callback: (...args: unknown[]) => void) => {
          const list = handlers.get(event) ?? [];
          list.push(callback);
          handlers.set(event, list);
        },
      };
    });
  });

  it('parses stored PDFs with the configured runtime label', async () => {
    mocks.parser.getText.mockResolvedValue({
      text: `CHAPTER 1 Retrieval

Overview text.`,
    });

    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');
    const result = await pdfStructureParser.parseFromStorage('documents/test.pdf');

    expect(mocks.storageService.getDocumentContent).toHaveBeenCalledWith('documents/test.pdf');
    expect(mocks.PDFParse).toHaveBeenCalledTimes(1);
    expect(result.parserRuntime).toBe('pdf-parse');
    expect(result.headingCount).toBeGreaterThanOrEqual(1);
  });

  it('classifies slow parser execution as a timeout', async () => {
    mocks.env.documentIndexConfig.pdfTimeoutMs = 5;
    mocks.parser.getText.mockImplementation(() => new Promise(() => undefined));

    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');

    await expect(pdfStructureParser.parseFromStorage('documents/slow.pdf')).rejects.toMatchObject({
      name: 'PdfStructureParserRuntimeError',
      code: 'timeout',
      runtime: 'pdf-parse',
    });
    expect(mocks.parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('runs docling helper when configured for docling runtime', async () => {
    mocks.env.documentIndexConfig.pdfRuntime = 'docling';

    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');
    const result = await pdfStructureParser.parseFromStorage('documents/docling.pdf');

    expect(mocks.storageService.getDocumentContent).toHaveBeenCalledWith('documents/docling.pdf');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.fs.writeFile).toHaveBeenCalled();
    expect(mocks.fs.readFile).toHaveBeenCalled();
    expect(result.parserRuntime).toBe('docling');
    expect(result.headingCount).toBeGreaterThanOrEqual(1);
  });
});

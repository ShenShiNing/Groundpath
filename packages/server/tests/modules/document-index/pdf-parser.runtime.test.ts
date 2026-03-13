import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    documentIndexConfig: {
      pdfTimeoutMs: 50,
      pdfConcurrency: 1,
    },
    featureFlags: {
      imageDescriptionEnabled: false,
    },
  },
  storageService: {
    getDocumentContent: vi.fn(),
  },
  fs: {
    access: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
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

vi.mock('node:fs/promises', () => ({
  default: mocks.fs,
  ...mocks.fs,
}));
vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('@core/logger', () => ({
  createLogger: () => mocks.logger,
}));

describe('pdfStructureParser runtime (docling only)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.env.documentIndexConfig.pdfTimeoutMs = 50;
    mocks.env.documentIndexConfig.pdfConcurrency = 1;
    mocks.env.featureFlags.imageDescriptionEnabled = false;
    mocks.storageService.getDocumentContent.mockResolvedValue(Buffer.from('fake pdf'));
    mocks.fs.access.mockResolvedValue(undefined);
    mocks.fs.mkdir.mockResolvedValue(undefined);
    mocks.fs.mkdtemp.mockResolvedValue('D:\\temp\\docling-run');
    mocks.fs.writeFile.mockResolvedValue(undefined);
    mocks.fs.readFile.mockResolvedValue('## Parsed Markdown');
    mocks.fs.readdir.mockResolvedValue(['output.md']);
    mocks.fs.stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
      size: 120,
    });
    mocks.fs.rm.mockResolvedValue(undefined);
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

  it('runs docling helper and returns parserRuntime as docling', async () => {
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

  it('classifies slow docling execution as a timeout', async () => {
    mocks.env.documentIndexConfig.pdfTimeoutMs = 5;
    mocks.spawn.mockImplementation(() => {
      const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: (event: string, callback: (...args: unknown[]) => void) => {
          const list = handlers.get(event) ?? [];
          list.push(callback);
          handlers.set(event, list);
        },
      };
    });

    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');

    await expect(pdfStructureParser.parseFromStorage('documents/slow.pdf')).rejects.toMatchObject({
      name: 'PdfStructureParserRuntimeError',
      code: 'timeout',
      runtime: 'docling',
    });
  });

  it('fails when docling helper script is missing', async () => {
    mocks.fs.access.mockImplementation(async (target: string) => {
      if (String(target).includes('docling-export-single.py')) {
        throw new Error('ENOENT');
      }
      return undefined;
    });

    const { pdfStructureParser } =
      await import('@modules/document-index/services/parsers/pdf-structure.parser');

    await expect(
      pdfStructureParser.parseFromStorage('documents/missing.pdf')
    ).rejects.toMatchObject({
      name: 'PdfStructureParserRuntimeError',
      code: 'parse_failed',
      runtime: 'docling',
    });
  });
});

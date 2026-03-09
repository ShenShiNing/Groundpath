import pLimit from 'p-limit';
import { documentIndexConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { PDFParse } from 'pdf-parse';

const logger = createLogger('pdf-parser.runtime');
const pdfParseLimiter = pLimit(documentIndexConfig.pdfConcurrency);

type SupportedPdfRuntime = (typeof documentIndexConfig)['pdfRuntime'];

export class PdfStructureParserRuntimeError extends Error {
  code: 'timeout' | 'unsupported_runtime' | 'parse_failed';
  runtime: SupportedPdfRuntime;

  constructor(
    code: PdfStructureParserRuntimeError['code'],
    runtime: SupportedPdfRuntime,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'PdfStructureParserRuntimeError';
    this.code = code;
    this.runtime = runtime;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, runtime: SupportedPdfRuntime) {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new PdfStructureParserRuntimeError(
              'timeout',
              runtime,
              `PDF parser timed out after ${timeoutMs}ms using runtime "${runtime}".`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function parseWithPdfParse(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await withTimeout(
      parser.getText(),
      documentIndexConfig.pdfTimeoutMs,
      documentIndexConfig.pdfRuntime
    );
    return result.text || '';
  } catch (error) {
    if (error instanceof PdfStructureParserRuntimeError) {
      throw error;
    }

    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      documentIndexConfig.pdfRuntime,
      'PDF parser failed to extract text.',
      { cause: error }
    );
  } finally {
    try {
      await parser.destroy();
    } catch (error) {
      logger.warn({ err: error }, 'Failed to destroy PDF parser instance cleanly');
    }
  }
}

export async function extractStructuredPdfText(buffer: Buffer): Promise<string> {
  return pdfParseLimiter(async () => {
    switch (documentIndexConfig.pdfRuntime) {
      case 'pdf-parse':
        return parseWithPdfParse(buffer);
      case 'marker':
      case 'docling':
        throw new PdfStructureParserRuntimeError(
          'unsupported_runtime',
          documentIndexConfig.pdfRuntime,
          `PDF runtime "${documentIndexConfig.pdfRuntime}" is configured but not implemented yet.`
        );
    }
  });
}

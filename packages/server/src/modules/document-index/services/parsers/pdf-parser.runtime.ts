import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pLimit from 'p-limit';
import { documentIndexConfig, featureFlags } from '@config/env';
import { createLogger } from '@shared/logger';
import type { ExtractedPdfImage } from './types';

const logger = createLogger('pdf-parser.runtime');
const pdfRuntimeLimiter = pLimit(documentIndexConfig.pdfConcurrency);
const workspaceRoot = path.resolve(import.meta.dirname, '../../../../../../..');
const runtimeTempRoot = path.join(workspaceRoot, '.cache', 'structured-rag', 'runtime');
const localPythonPath = path.join(
  workspaceRoot,
  '.cache',
  'python312',
  'python-3.12.10-amd64',
  process.platform === 'win32' ? 'python.exe' : 'bin/python3'
);
const defaultDoclingHelperPath = path.join(workspaceRoot, 'scripts', 'docling-export-single.py');

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class PdfStructureParserRuntimeError extends Error {
  code: 'timeout' | 'unsupported_runtime' | 'parse_failed';
  runtime: string;

  constructor(
    code: PdfStructureParserRuntimeError['code'],
    runtime: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'PdfStructureParserRuntimeError';
    this.code = code;
    this.runtime = runtime;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, runtime: string) {
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

async function commandExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function buildPdfRuntimeEnv(tempDir: string): NodeJS.ProcessEnv {
  const modelCacheRoot = path.join(workspaceRoot, '.cache', 'structured-rag', 'model-cache');
  const hfHome = process.env.HF_HOME ?? path.join(modelCacheRoot, 'hf');
  const hfHubCache = process.env.HUGGINGFACE_HUB_CACHE ?? path.join(hfHome, 'hub');
  const torchHome = process.env.TORCH_HOME ?? path.join(modelCacheRoot, 'torch');
  const transformersCache =
    process.env.TRANSFORMERS_CACHE ?? path.join(modelCacheRoot, 'transformers');
  const modelCacheDir =
    process.env.MODEL_CACHE_DIR ??
    path.join(process.env.LOCALAPPDATA ?? workspaceRoot, 'datalab', 'datalab', 'Cache', 'models');

  return {
    ...process.env,
    HF_HOME: hfHome,
    HUGGINGFACE_HUB_CACHE: hfHubCache,
    TORCH_HOME: torchHome,
    TRANSFORMERS_CACHE: transformersCache,
    MODEL_CACHE_DIR: modelCacheDir,
    HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? '1',
    TMP: process.env.TMP ?? tempDir,
    TEMP: process.env.TEMP ?? tempDir,
    PYTHONIOENCODING: process.env.PYTHONIOENCODING ?? 'utf-8',
  };
}

async function parseWithDocling(buffer: Buffer): Promise<string> {
  const pythonPath = (await commandExists(localPythonPath)) ? localPythonPath : 'python';
  const helperPath = defaultDoclingHelperPath;
  if (!(await commandExists(helperPath))) {
    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      'docling',
      `Docling helper script not found at "${helperPath}".`
    );
  }

  await fs.mkdir(runtimeTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(runtimeTempRoot, 'docling-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputPath = path.join(tempDir, 'output.md');

  try {
    await fs.writeFile(inputPath, buffer);
    const commandPromise = runCommand(
      pythonPath,
      [helperPath, '--input', inputPath, '--output', outputPath],
      buildPdfRuntimeEnv(tempDir)
    );
    const result = await withTimeout(commandPromise, documentIndexConfig.pdfTimeoutMs, 'docling');

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        'docling',
        stderr || stdout || 'Docling parser failed to export markdown.'
      );
    }

    const output = await fs.readFile(outputPath, 'utf-8');
    return output;
  } catch (error) {
    if (error instanceof PdfStructureParserRuntimeError) {
      throw error;
    }

    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      'docling',
      'Docling parser failed to export markdown.',
      { cause: error }
    );
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ err: error, tempDir }, 'Failed to cleanup docling temp directory');
    }
  }
}

export async function extractStructuredPdfText(buffer: Buffer): Promise<string> {
  return pdfRuntimeLimiter(() => parseWithDocling(buffer));
}

export interface StructuredPdfParseResult {
  markdown: string;
  images: ExtractedPdfImage[];
}

async function parseWithDoclingAndImages(buffer: Buffer): Promise<StructuredPdfParseResult> {
  const pythonPath = (await commandExists(localPythonPath)) ? localPythonPath : 'python';
  const helperPath = defaultDoclingHelperPath;
  if (!(await commandExists(helperPath))) {
    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      'docling',
      `Docling helper script not found at "${helperPath}".`
    );
  }

  await fs.mkdir(runtimeTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(runtimeTempRoot, 'docling-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputPath = path.join(tempDir, 'output.md');
  const imageDir = path.join(tempDir, 'images');

  try {
    await fs.writeFile(inputPath, buffer);
    await fs.mkdir(imageDir, { recursive: true });

    const commandPromise = runCommand(
      pythonPath,
      [
        helperPath,
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--export-images',
        '--image-dir',
        imageDir,
      ],
      buildPdfRuntimeEnv(tempDir)
    );
    const result = await withTimeout(commandPromise, documentIndexConfig.pdfTimeoutMs, 'docling');

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        'docling',
        stderr || stdout || 'Docling parser failed to export markdown.'
      );
    }

    const markdown = await fs.readFile(outputPath, 'utf-8');

    // Read exported images
    const images: ExtractedPdfImage[] = [];
    try {
      const imageFiles = await fs.readdir(imageDir);
      const pngFiles = imageFiles
        .filter((f) => f.endsWith('.png'))
        .sort((a, b) => {
          const idxA = parseInt(a.match(/(\d+)/)?.[1] ?? '0', 10);
          const idxB = parseInt(b.match(/(\d+)/)?.[1] ?? '0', 10);
          return idxA - idxB;
        });

      for (let i = 0; i < pngFiles.length; i++) {
        const filePath = path.join(imageDir, pngFiles[i]!);
        const imgBuffer = await fs.readFile(filePath);
        images.push({
          index: i,
          buffer: imgBuffer,
          mimeType: 'image/png',
          sizeBytes: imgBuffer.length,
        });
      }
    } catch {
      // No images exported — fine, degrade gracefully
    }

    return { markdown, images };
  } catch (error) {
    if (error instanceof PdfStructureParserRuntimeError) {
      throw error;
    }
    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      'docling',
      'Docling parser failed to export markdown with images.',
      { cause: error }
    );
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ err: error, tempDir }, 'Failed to cleanup docling temp directory');
    }
  }
}

export async function extractStructuredPdfWithImages(
  buffer: Buffer
): Promise<StructuredPdfParseResult> {
  return pdfRuntimeLimiter(async () => {
    if (featureFlags.imageDescriptionEnabled) {
      return parseWithDoclingAndImages(buffer);
    }

    const markdown = await parseWithDocling(buffer);
    return { markdown, images: [] };
  });
}

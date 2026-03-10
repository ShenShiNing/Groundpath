import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pLimit from 'p-limit';
import { documentIndexConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { PDFParse } from 'pdf-parse';

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
const TEXT_ARTIFACT_EXT_PRIORITY = ['.md', '.markdown', '.txt', '.text', '.json'];

type SupportedPdfRuntime = (typeof documentIndexConfig)['pdfRuntime'];

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  runtime: SupportedPdfRuntime
) {
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

async function commandExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(command: string): Promise<string | null> {
  const trimmed = command.trim();
  if (!trimmed) return null;

  if (path.isAbsolute(trimmed) || trimmed.includes(path.sep)) {
    return (await commandExists(trimmed)) ? trimmed : null;
  }

  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${trimmed}${extension}`);
      if (await commandExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
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
      'unsupported_runtime',
      documentIndexConfig.pdfRuntime,
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
    const result = await withTimeout(
      commandPromise,
      documentIndexConfig.pdfTimeoutMs,
      documentIndexConfig.pdfRuntime
    );

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        documentIndexConfig.pdfRuntime,
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
      documentIndexConfig.pdfRuntime,
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

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(rootDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function findBestTextArtifact(outputDir: string): Promise<string | null> {
  const files = await listFilesRecursively(outputDir);
  if (files.length === 0) return null;

  const candidates = await Promise.all(
    files
      .filter((filePath) => TEXT_ARTIFACT_EXT_PRIORITY.includes(path.extname(filePath).toLowerCase()))
      .map(async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const stats = await fs.stat(filePath);
        const extRank = TEXT_ARTIFACT_EXT_PRIORITY.indexOf(ext);
        return {
          filePath,
          extRank: extRank === -1 ? 999 : extRank,
          size: stats.size,
        };
      })
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.extRank !== b.extRank) return a.extRank - b.extRank;
    return b.size - a.size;
  });

  return candidates[0]?.filePath ?? null;
}

async function readTextArtifact(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const content = await fs.readFile(filePath, 'utf-8');
  if (ext !== '.json') return content;

  try {
    const payload = JSON.parse(content) as Record<string, unknown>;
    if (typeof payload.markdown === 'string') return payload.markdown;
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.content === 'string') return payload.content;
  } catch (error) {
    logger.warn({ err: error, filePath }, 'Failed to parse marker json output');
  }

  return content;
}

function isMarkerModuleMissing(message: string): boolean {
  return /no module named (marker|marker_single)/i.test(message) || /ModuleNotFoundError/i.test(message);
}

function buildMarkerArgs(inputPath: string, outputDir: string): string[] {
  return [
    inputPath,
    '--output_dir',
    outputDir,
    '--output_format',
    'markdown',
    '--disable_multiprocessing',
    '--disable_ocr',
  ];
}

async function parseWithMarker(buffer: Buffer): Promise<string> {
  const configuredCommand = documentIndexConfig.markerCommand?.trim();
  const pythonPath = (await commandExists(localPythonPath)) ? localPythonPath : 'python';

  await fs.mkdir(runtimeTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(runtimeTempRoot, 'marker-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputDir = path.join(tempDir, 'output');

  try {
    await fs.writeFile(inputPath, buffer);
    await fs.mkdir(outputDir, { recursive: true });

    const runtimeEnv = buildPdfRuntimeEnv(tempDir);
    let command: string;
    let args: string[];

    if (configuredCommand) {
      const resolved = await resolveExecutable(configuredCommand);
      if (!resolved) {
        throw new PdfStructureParserRuntimeError(
          'unsupported_runtime',
          documentIndexConfig.pdfRuntime,
          `Marker command "${configuredCommand}" not found on PATH.`
        );
      }
      command = resolved;
      args = buildMarkerArgs(inputPath, outputDir);
    } else {
      const resolvedPython = await resolveExecutable(pythonPath);
      if (resolvedPython) {
        command = resolvedPython;
        args = [
          '-c',
          'from marker.scripts.convert_single import convert_single_cli; convert_single_cli()',
          ...buildMarkerArgs(inputPath, outputDir),
        ];
      } else {
        const markerBinary = await resolveExecutable('marker_single');
        if (!markerBinary) {
          throw new PdfStructureParserRuntimeError(
            'unsupported_runtime',
            documentIndexConfig.pdfRuntime,
            'Marker runtime is not available. Install marker or configure DOCUMENT_INDEX_MARKER_COMMAND.'
          );
        }
        command = markerBinary;
        args = buildMarkerArgs(inputPath, outputDir);
      }
    }

    let result: CommandResult;
    try {
      result = await withTimeout(
        runCommand(command, args, runtimeEnv),
        documentIndexConfig.pdfTimeoutMs,
        documentIndexConfig.pdfRuntime
      );
    } catch (error) {
      if (error instanceof PdfStructureParserRuntimeError) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new PdfStructureParserRuntimeError(
          'unsupported_runtime',
          documentIndexConfig.pdfRuntime,
          'Marker runtime is not available on this host.',
          { cause: error }
        );
      }
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        documentIndexConfig.pdfRuntime,
        'Marker parser failed to run.',
        { cause: error }
      );
    }

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      const stdout = result.stdout.trim();
      const errorOutput = [stderr, stdout].filter(Boolean).join('\n');
      if (isMarkerModuleMissing(errorOutput)) {
        throw new PdfStructureParserRuntimeError(
          'unsupported_runtime',
          documentIndexConfig.pdfRuntime,
          errorOutput || 'Marker runtime is not installed.'
        );
      }
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        documentIndexConfig.pdfRuntime,
        errorOutput || 'Marker parser failed to export markdown.'
      );
    }

    const artifact = await findBestTextArtifact(outputDir);
    if (!artifact) {
      throw new PdfStructureParserRuntimeError(
        'parse_failed',
        documentIndexConfig.pdfRuntime,
        'Marker parser completed without producing a markdown artifact.'
      );
    }

    return await readTextArtifact(artifact);
  } catch (error) {
    if (error instanceof PdfStructureParserRuntimeError) {
      throw error;
    }

    throw new PdfStructureParserRuntimeError(
      'parse_failed',
      documentIndexConfig.pdfRuntime,
      'Marker parser failed to export markdown.',
      { cause: error }
    );
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ err: error, tempDir }, 'Failed to cleanup marker temp directory');
    }
  }
}

export async function extractStructuredPdfText(buffer: Buffer): Promise<string> {
  return pdfRuntimeLimiter(async () => {
    switch (documentIndexConfig.pdfRuntime) {
      case 'pdf-parse':
        return parseWithPdfParse(buffer);
      case 'marker':
        return parseWithMarker(buffer);
      case 'docling':
        return parseWithDocling(buffer);
    }
  });
}

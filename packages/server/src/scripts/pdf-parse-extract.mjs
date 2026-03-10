import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

function parseArgs(argv) {
  let inputPath;
  let maxPages;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--max-pages') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --max-pages');
      }
      maxPages = Number.parseInt(value, 10);
      index += 1;
      continue;
    }

    if (!inputPath) {
      inputPath = arg;
      continue;
    }
  }

  return { inputPath, maxPages };
}

const { inputPath, maxPages } = parseArgs(process.argv.slice(2));

if (!inputPath) {
  console.error('Usage: node pdf-parse-extract.mjs <input-pdf> [--max-pages N]');
  process.exit(1);
}

const resolvedPath = path.resolve(inputPath);
const buffer = await fs.readFile(resolvedPath);
const parser = new PDFParse({ data: buffer });

try {
  const result = await parser.getText();
  const totalPageCount =
    typeof result.total === 'number'
      ? result.total
      : Array.isArray(result.pages)
        ? result.pages.length
        : null;
  const limitedPages =
    typeof maxPages === 'number' &&
    Number.isFinite(maxPages) &&
    maxPages > 0 &&
    Array.isArray(result.pages)
      ? result.pages.slice(0, maxPages)
      : result.pages;
  const limitedText =
    Array.isArray(limitedPages) && limitedPages.length > 0
      ? limitedPages.map((page) => page.text ?? '').join('\n\n')
      : (result.text ?? '');

  const payload = {
    runtime: 'pdf-parse',
    inputPath: resolvedPath,
    pageCount:
      Array.isArray(limitedPages) && limitedPages.length > 0 ? limitedPages.length : totalPageCount,
    totalPageCount,
    text: limitedText,
    info: result.info ?? null,
  };

  process.stdout.write(JSON.stringify(payload));
} finally {
  try {
    await parser.destroy();
  } catch {
    // Best-effort cleanup only.
  }
}

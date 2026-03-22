import { useMemo } from 'react';
import { Loader2, FileWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DocumentType } from '@groundpath/shared/types';
import { cn } from '@/lib/utils';

interface DocumentReaderProps {
  documentType: DocumentType;
  textContent: string | null;
  storageUrl: string | null;
  isLoading?: boolean;
  className?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 验证 URL 是否安全 */
function sanitizeUrl(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 处理行内格式（链接、粗体、斜体、代码）
 * 注意：必须在原始文本上调用，不能在已转义的文本上调用
 */
function formatInline(text: string): string {
  // 使用占位符保护已处理的 HTML，避免被后续处理破坏
  const placeholders: string[] = [];
  const PLACEHOLDER_PREFIX = '__INLINE_HTML_';
  const PLACEHOLDER_SUFFIX = '__';

  const placeholder = (html: string) => {
    const idx = placeholders.length;
    placeholders.push(html);
    return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
  };

  let result = text;

  // 1. Inline code: `code` - 先处理，内部内容需要转义
  result = result.replace(/`([^`]+)`/g, (_, code: string) => {
    return placeholder(`<code class="rounded bg-muted px-1 py-0.5">${escapeHtml(code)}</code>`);
  });

  // 2. Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    const safeLabel = escapeHtml(label);
    if (!safeUrl) return placeholder(safeLabel);
    return placeholder(
      `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${safeLabel}</a>`
    );
  });

  // 3. Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, (_, content: string) => {
    return placeholder(`<strong>${escapeHtml(content)}</strong>`);
  });

  // 4. Italic: *text* (兼容性正则，不使用 lookbehind)
  result = result.replace(
    /(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g,
    (_, prefix: string, content: string) => {
      // prefix 可能包含占位符，不要转义
      return prefix + placeholder(`<em>${escapeHtml(content)}</em>`);
    }
  );

  // 5. 转义剩余的普通文本（分段处理以保护占位符）
  const placeholderPattern = new RegExp(`${PLACEHOLDER_PREFIX}\\d+${PLACEHOLDER_SUFFIX}`, 'g');
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderPattern.exec(result)) !== null) {
    // 转义占位符之前的文本
    if (match.index > lastIndex) {
      parts.push(escapeHtml(result.slice(lastIndex, match.index)));
    }
    // 保留占位符
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  // 转义最后一段文本
  if (lastIndex < result.length) {
    parts.push(escapeHtml(result.slice(lastIndex)));
  }

  result = parts.join('');

  // 6. 还原占位符
  result = result.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_, idx: string) => placeholders[parseInt(idx, 10)] ?? ''
  );

  return result;
}

function renderMarkdownSafe(markdown: string): string {
  const lines = markdown.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inList = false;

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      const code = escapeHtml(codeBuffer.join('\n'));
      html.push(`<pre class="rounded-md bg-muted p-3 overflow-auto"><code>${code}</code></pre>`);
      codeBuffer = [];
    }
  };

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // List handling - 在原始文本上操作
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="list-disc pl-6 space-y-1">');
        inList = true;
      }
      const itemText = line.replace(/^\s*[-*]\s+/, '');
      const item = formatInline(itemText);
      html.push(`<li>${item}</li>`);
      continue;
    } else {
      closeList();
    }

    // Headings - 在原始文本上操作
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = formatInline(headingMatch[2]);
      html.push(`<h${level} class="mt-4 mb-2 font-semibold">${content}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      html.push('<hr class="my-4 border-border" />');
      continue;
    }

    // Paragraphs / blank lines
    if (line.trim().length === 0) {
      html.push('');
      continue;
    }

    const paragraph = formatInline(line);
    html.push(`<p class="mb-3 leading-7">${paragraph}</p>`);
  }

  closeList();
  flushCode();

  return html.join('\n');
}

export function DocumentReader({
  documentType,
  textContent,
  storageUrl,
  isLoading,
  className,
}: DocumentReaderProps) {
  const { t } = useTranslation('document');
  const rendered = useMemo(
    () => (textContent ? renderMarkdownSafe(textContent) : null),
    [textContent]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          aria-label={t('reader.loading')}
          className="h-8 w-8 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  // PDF - 显示下载提示
  if (documentType === 'pdf') {
    return (
      <div className={cn('text-center py-12 border rounded-lg bg-muted/30 space-y-3', className)}>
        <p className="text-muted-foreground flex items-center justify-center gap-2">
          <FileWarning className="h-4 w-4" aria-hidden="true" />
          {t('reader.pdfNotSupported')}
        </p>
        {storageUrl && (
          <a
            className="text-primary underline"
            href={storageUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('reader.downloadToView')}
          </a>
        )}
      </div>
    );
  }

  // DOCX fallback
  if (documentType === 'docx') {
    return (
      <div className={cn('text-center py-12 border rounded-lg bg-muted/30 space-y-3', className)}>
        <p className="text-muted-foreground flex items-center justify-center gap-2">
          <FileWarning className="h-4 w-4" aria-hidden="true" />
          {t('reader.docxNotSupported')}
        </p>
        {storageUrl && (
          <a
            className="text-primary underline"
            href={storageUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('reader.downloadToView')}
          </a>
        )}
      </div>
    );
  }

  // Markdown / Text
  if ((documentType === 'markdown' || documentType === 'text') && textContent) {
    return (
      <div
        className={cn(
          'w-full min-h-100 max-h-150 overflow-auto border rounded-lg p-6 bg-background prose prose-sm dark:prose-invert',
          className
        )}
        dangerouslySetInnerHTML={{ __html: rendered ?? '' }}
      />
    );
  }

  return (
    <div className={cn('text-center py-12 border rounded-lg bg-muted/30', className)}>
      <p className="text-muted-foreground">{t('reader.noContent')}</p>
    </div>
  );
}

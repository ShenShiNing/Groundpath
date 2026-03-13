import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import MDEditor from '@uiw/react-md-editor/nohighlight';
import { Link } from '@tanstack/react-router';
import type { Citation } from '@/stores';
import { CitationInline } from './CitationInline';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ChatMarkdownProps {
  content: string;
  citations?: Citation[];
  onCitationClick: (citation: Citation) => void;
  isStreaming?: boolean;
}

type CodeRendererProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};
type MarkdownRendererProps = {
  source?: string;
  className?: string;
  components?: Record<string, unknown>;
};

const CITATION_PATTERN = /\[(\d+)\](?!\()/g;
const FENCED_CODE_PATTERN = /(```[\s\S]*?```)/g;
const INLINE_CODE_PATTERN = /(`[^`\n]+`)/g;
const STREAMING_TOKEN_PATTERN = /(`[^`\n]+`|\[\d+\])/g;

function replaceCitationTokensOutsideCode(text: string): string {
  return text
    .split(INLINE_CODE_PATTERN)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment.replace(CITATION_PATTERN, (_, rawIndex: string) => {
        return `[${rawIndex}](#citation-${rawIndex})`;
      });
    })
    .join('');
}

function injectCitationLinks(markdown: string): string {
  return markdown
    .split(FENCED_CODE_PATTERN)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return replaceCitationTokensOutsideCode(segment);
    })
    .join('');
}

function getCitationIndex(href?: string): number | null {
  if (!href) return null;
  const match = href.match(/^#citation-(\d+)$/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  return Number.isFinite(index) && index > 0 ? index : null;
}

function renderStreamingContent(
  content: string,
  citationMap: Map<number, Citation>,
  onCitationClick: (citation: Citation) => void
): ReactNode {
  const lines = content.split('\n');

  return lines.map((line, lineIndex) => {
    const segments = line.split(STREAMING_TOKEN_PATTERN);

    return (
      <Fragment key={`line-${lineIndex}`}>
        {segments.map((segment, segmentIndex) => {
          if (!segment) return null;

          const inlineCodeMatch = segment.match(/^`([^`\n]+)`$/);
          if (inlineCodeMatch) {
            return (
              <code
                key={`code-${lineIndex}-${segmentIndex}`}
                className="rounded border px-1 py-0.5 font-mono text-[0.9em]"
              >
                {inlineCodeMatch[1]}
              </code>
            );
          }

          const citationMatch = segment.match(/^\[(\d+)\]$/);
          if (citationMatch) {
            const citationIndex = Number.parseInt(citationMatch[1], 10);
            const citation = citationMap.get(citationIndex);
            if (citation) {
              return (
                <CitationInline
                  key={`citation-${lineIndex}-${segmentIndex}`}
                  index={citationIndex}
                  citation={citation}
                  onClick={() => onCitationClick(citation)}
                />
              );
            }
          }

          return <Fragment key={`text-${lineIndex}-${segmentIndex}`}>{segment}</Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

export function ChatMarkdown({
  content,
  citations,
  onCitationClick,
  isStreaming = false,
}: ChatMarkdownProps) {
  const { t } = useTranslation('chat');
  const source = useMemo(
    () => (isStreaming ? '' : injectCitationLinks(content)),
    [content, isStreaming]
  );
  const hasFencedCodeBlock = useMemo(
    () => !isStreaming && /```|~~~/.test(content),
    [content, isStreaming]
  );
  const [highlightRenderer, setHighlightRenderer] =
    useState<ComponentType<MarkdownRendererProps> | null>(null);

  useEffect(() => {
    if (!hasFencedCodeBlock || highlightRenderer) return;

    let cancelled = false;
    const loadHighlightRenderer = async () => {
      const [{ default: HighLightMDEditor }] = await Promise.all([
        import('@uiw/react-md-editor'),
        import('@uiw/react-md-editor/markdown-editor.css'),
      ]);
      if (cancelled) return;
      setHighlightRenderer(
        () => HighLightMDEditor.Markdown as ComponentType<MarkdownRendererProps>
      );
    };

    void loadHighlightRenderer();
    return () => {
      cancelled = true;
    };
  }, [hasFencedCodeBlock, highlightRenderer]);

  const citationMap = useMemo(
    () => new Map((citations ?? []).map((citation, index) => [index + 1, citation])),
    [citations]
  );
  const MarkdownRenderer =
    hasFencedCodeBlock && highlightRenderer ? highlightRenderer : MDEditor.Markdown;
  const handleCopyToast = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.copied')) {
        toast.success(t('markdown.codeCopied'));
      }
    },
    [t]
  );

  return (
    <div className="min-w-0" onClickCapture={handleCopyToast}>
      {isStreaming ? (
        <div className="text-sm leading-6 whitespace-pre-wrap break-words">
          {renderStreamingContent(content, citationMap, onCitationClick)}
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-current align-middle"
          />
        </div>
      ) : (
        <MarkdownRenderer
          source={source}
          className="bg-transparent! p-0! text-sm leading-6 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:mt-3 [&_h3]:mb-2 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:p-3 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_hr]:my-4"
          components={{
            a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
              const citationIndex = getCitationIndex(href);
              if (citationIndex) {
                const citation = citationMap.get(citationIndex);
                if (citation) {
                  return (
                    <CitationInline
                      index={citationIndex}
                      citation={citation}
                      onClick={() => onCitationClick(citation)}
                    />
                  );
                }
                return <span>[{citationIndex}]</span>;
              }

              if (href?.startsWith('/')) {
                return (
                  <Link to={href as string} className="underline break-all">
                    {children}
                  </Link>
                );
              }

              return (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all"
                >
                  {children}
                </a>
              );
            },
            code: ({ inline, className, ...props }: CodeRendererProps) => {
              if (inline) {
                return (
                  <code {...props} className="rounded border px-1 py-0.5 font-mono text-[0.9em]" />
                );
              }
              return <code {...props} className={className} />;
            },
          }}
        />
      )}
    </div>
  );
}

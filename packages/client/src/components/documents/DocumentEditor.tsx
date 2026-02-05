import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentType } from '@knowledge-agent/shared/types';
import MDEditor from '@uiw/react-md-editor';
import { Save, RotateCcw } from 'lucide-react';
import { useTheme } from '@/components/theme/theme-provider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import '@uiw/react-md-editor/markdown-editor.css';

interface DocumentEditorProps {
  documentId: string;
  documentType: DocumentType;
  initialContent: string;
  isSaving?: boolean;
  isTruncated?: boolean;
  onSave: (content: string) => Promise<void>;
  onError?: (error: unknown) => void;
  className?: string;
}

type DraftPayload = {
  content: string;
  updatedAt: number;
};

export function DocumentEditor({
  documentId,
  documentType,
  initialContent,
  isSaving,
  isTruncated,
  onSave,
  onError,
  className,
}: DocumentEditorProps) {
  const { theme } = useTheme();
  const draftKey = useMemo(() => `document-draft:${documentId}`, [documentId]);
  const initialState = useMemo(() => {
    const fallback = initialContent ?? '';
    if (typeof window === 'undefined') {
      return { content: fallback, isDirty: false, draftRestored: false };
    }
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return { content: fallback, isDirty: false, draftRestored: false };
      const parsed = JSON.parse(raw) as DraftPayload;
      if (typeof parsed?.content !== 'string') {
        return { content: fallback, isDirty: false, draftRestored: false };
      }
      const hasDraft = parsed.content !== fallback;
      return {
        content: parsed.content,
        isDirty: hasDraft,
        draftRestored: hasDraft,
      };
    } catch {
      return { content: fallback, isDirty: false, draftRestored: false };
    }
  }, [draftKey, initialContent]);

  const [content, setContent] = useState(initialState.content);
  const [isDirty, setIsDirty] = useState(initialState.isDirty);
  const [draftRestored, setDraftRestored] = useState(initialState.draftRestored);
  const savedContentRef = useRef(initialContent ?? '');
  const colorMode = useMemo(() => {
    if (theme === 'dark' || theme === 'light') return theme;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'light';
  }, [theme]);

  useEffect(() => {
    savedContentRef.current = initialContent ?? '';
  }, [initialContent]);

  useEffect(() => {
    if (!isDirty) return;
    const timeoutId = window.setTimeout(() => {
      const payload: DraftPayload = { content, updatedAt: Date.now() };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    }, 2000);
    return () => window.clearTimeout(timeoutId);
  }, [content, draftKey, isDirty]);

  const updateContent = useCallback((value: string) => {
    setContent(value);
    setIsDirty(value !== savedContentRef.current);
  }, []);

  const handleReset = useCallback(() => {
    setContent(savedContentRef.current);
    setIsDirty(false);
    setDraftRestored(false);
    localStorage.removeItem(draftKey);
  }, [draftKey]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      await onSave(content);
      savedContentRef.current = content;
      setIsDirty(false);
      setDraftRestored(false);
      localStorage.removeItem(draftKey);
    } catch (error) {
      onError?.(error);
    }
  }, [content, draftKey, isSaving, onError, onSave]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground space-x-2">
          <span>{isDirty ? '未保存更改' : '已保存'}</span>
          {draftRestored && <span>已恢复本地草稿</span>}
          {isTruncated && <span className="text-destructive">内容已截断</span>}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              重置
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {documentType === 'markdown' ? (
        <div data-color-mode={colorMode}>
          <MDEditor value={content} onChange={(value) => updateContent(value ?? '')} height={480} />
        </div>
      ) : (
        <Textarea
          value={content}
          onChange={(event) => updateContent(event.target.value)}
          className="min-h-105 font-mono text-sm leading-6"
        />
      )}
    </div>
  );
}

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Square } from 'lucide-react';
import type { GenerationStyle } from '@knowledge-agent/shared/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { streamExpand } from '@/api/document-ai';
import { useSaveDocumentContent } from '@/hooks';
import { getAccessToken } from '@/lib/http/auth';

type RewritePosition = 'replace' | 'before' | 'after';

interface AIRewriteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  currentContent: string;
  knowledgeBaseId?: string;
  onSaveSuccess: () => void;
}

export function AIRewriteDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  currentContent,
  knowledgeBaseId,
  onSaveSuccess,
}: AIRewriteDialogProps) {
  const { t } = useTranslation('document');

  const [instruction, setInstruction] = useState('');
  const [position, setPosition] = useState<RewritePosition>('replace');
  const [style, setStyle] = useState<GenerationStyle | ''>('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();

  const resetState = useCallback(() => {
    setInstruction('');
    setPosition('replace');
    setStyle('');
    setGeneratedContent('');
    setIsGenerating(false);
    setHasGenerated(false);
    abortRef.current = null;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        abortRef.current?.abort();
        resetState();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetState]
  );

  const handleGenerate = useCallback(() => {
    if (!instruction.trim()) return;

    setGeneratedContent('');
    setIsGenerating(true);
    setHasGenerated(false);

    const controller = streamExpand(
      documentId,
      {
        instruction: instruction.trim(),
        position,
        ...(style ? { style } : {}),
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
      },
      {
        onChunk: (text) => {
          setGeneratedContent((prev) => prev + text);
        },
        onDone: () => {
          setIsGenerating(false);
          setHasGenerated(true);
        },
        onError: () => {
          setIsGenerating(false);
          setHasGenerated(true);
        },
      },
      getAccessToken
    );

    abortRef.current = controller;
  }, [documentId, instruction, knowledgeBaseId, position, style]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setHasGenerated(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!generatedContent.trim()) return;

    let finalContent: string;
    switch (position) {
      case 'before':
        finalContent = generatedContent + '\n\n' + currentContent;
        break;
      case 'after':
        finalContent = currentContent + '\n\n' + generatedContent;
        break;
      case 'replace':
      default:
        finalContent = generatedContent;
        break;
    }

    const changeNote = `AI 改写: ${instruction.substring(0, 100)}`;
    await saveContent({ id: documentId, data: { content: finalContent, changeNote } });
    onSaveSuccess();
    resetState();
  }, [
    currentContent,
    documentId,
    generatedContent,
    instruction,
    onSaveSuccess,
    position,
    resetState,
    saveContent,
  ]);

  const previewTruncated =
    currentContent.length > 500 ? currentContent.slice(0, 500) + '...' : currentContent;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('aiRewrite.title')}</DialogTitle>
          <DialogDescription>
            {t('aiRewrite.description')}
            {documentTitle && (
              <span className="ml-1 font-medium text-foreground">{documentTitle}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="rewrite-instruction">{t('aiRewrite.instruction')}</Label>
            <Textarea
              id="rewrite-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t('aiRewrite.instructionPlaceholder')}
              rows={2}
              maxLength={1000}
              disabled={isGenerating}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rewrite-position">{t('aiRewrite.position')}</Label>
              <Select
                value={position}
                onValueChange={(v) => setPosition(v as RewritePosition)}
                disabled={isGenerating}
              >
                <SelectTrigger id="rewrite-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">{t('aiRewrite.positionReplace')}</SelectItem>
                  <SelectItem value="before">{t('aiRewrite.positionBefore')}</SelectItem>
                  <SelectItem value="after">{t('aiRewrite.positionAfter')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rewrite-style">{t('aiRewrite.style')}</Label>
              <Select
                value={style}
                onValueChange={(v) => setStyle(v as GenerationStyle | '')}
                disabled={isGenerating}
              >
                <SelectTrigger id="rewrite-style">
                  <SelectValue placeholder={t('aiRewrite.styleAuto')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">{t('aiRewrite.styleFormal')}</SelectItem>
                  <SelectItem value="casual">{t('aiRewrite.styleCasual')}</SelectItem>
                  <SelectItem value="technical">{t('aiRewrite.styleTechnical')}</SelectItem>
                  <SelectItem value="creative">{t('aiRewrite.styleCreative')}</SelectItem>
                  <SelectItem value="academic">{t('aiRewrite.styleAcademic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            {isGenerating ? (
              <Button variant="destructive" onClick={handleStop}>
                <Square className="size-4 mr-1.5" />
                {t('aiRewrite.stop')}
              </Button>
            ) : hasGenerated ? (
              <Button variant="outline" onClick={handleGenerate} disabled={!instruction.trim()}>
                <RefreshCw className="size-4 mr-1.5" />
                {t('aiRewrite.regenerate')}
              </Button>
            ) : (
              <Button onClick={handleGenerate} disabled={!instruction.trim()}>
                {t('aiRewrite.generate')}
              </Button>
            )}
          </div>
        </div>

        {/* Preview area: original vs generated */}
        {(isGenerating || hasGenerated) && (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">{t('aiRewrite.original')}</Label>
              <ScrollArea className="flex-1 rounded-md border p-3">
                <pre className="whitespace-pre-wrap text-sm">{previewTruncated}</pre>
              </ScrollArea>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">
                {isGenerating ? t('aiRewrite.generating') : t('aiRewrite.generated')}
              </Label>
              <ScrollArea className="flex-1 rounded-md border p-3">
                <pre className="whitespace-pre-wrap text-sm">
                  {generatedContent || (isGenerating ? '...' : '')}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('aiRewrite.cancel')}
          </Button>
          {hasGenerated && generatedContent.trim() && (
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  {t('aiRewrite.saving')}
                </>
              ) : (
                t('aiRewrite.saveAsVersion')
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

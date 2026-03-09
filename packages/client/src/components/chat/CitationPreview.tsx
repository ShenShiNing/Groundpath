import { FileText, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Citation } from '@/stores';
import {
  getCitationLocatorText,
  getCitationPageLabel,
  getCitationPreviewText,
} from '@/stores/chatPanelStore.types';

// ============================================================================
// Types
// ============================================================================

export interface CitationPreviewProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDocument?: (documentId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function CitationPreview({
  citation,
  open,
  onOpenChange,
  onOpenDocument,
}: CitationPreviewProps) {
  if (!citation) return null;

  const pageLabel = getCitationPageLabel(citation);
  const locatorText = getCitationLocatorText(citation);
  const previewText = getCitationPreviewText(citation);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base truncate">{citation.documentTitle}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {citation.sourceType}
                </Badge>
                {pageLabel && (
                  <Badge variant="secondary" className="text-[10px]">
                    {pageLabel}
                  </Badge>
                )}
                {citation.sourceType === 'chunk' && citation.chunkIndex !== undefined && (
                  <Badge variant="secondary" className="text-[10px]">
                    Chunk #{citation.chunkIndex + 1}
                  </Badge>
                )}
                {citation.documentVersion !== undefined && (
                  <Badge variant="outline" className="text-[10px]">
                    Doc v{citation.documentVersion}
                  </Badge>
                )}
                {citation.indexVersion && (
                  <Badge variant="outline" className="max-w-32 truncate text-[10px]">
                    {citation.indexVersion}
                  </Badge>
                )}
                {citation.score && (
                  <Badge variant="outline" className="text-[10px]">
                    {Math.round(citation.score * 100)}% match
                  </Badge>
                )}
              </div>
              {locatorText && <p className="mt-2 text-xs text-muted-foreground">{locatorText}</p>}
            </div>
          </div>
        </DialogHeader>

        {/* Citation Content */}
        <ScrollArea className="max-h-75 mt-4">
          <div className="bg-muted/50 rounded-lg p-4 border-l-4 border-primary">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{previewText}</p>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onOpenDocument && (
            <Button onClick={() => onOpenDocument(citation.documentId)}>
              <ExternalLink className="size-4 mr-2" />
              Open Document
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

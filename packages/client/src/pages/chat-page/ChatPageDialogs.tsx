import { CitationPreview } from '@/components/chat';
import { SaveToKBDialog } from '@/components/chat/SaveToKBDialog';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChatMessage, Citation } from '@/stores';
import { useTranslation } from 'react-i18next';

export interface ChatPageDialogsProps {
  createKbDialogOpen: boolean;
  onCreateKbDialogOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  conversationId: string | null;
  selectedKnowledgeBaseId: string | undefined;
  selectedKnowledgeBaseName?: string;
  onKbSwitch: (kbId: string) => void;
  uploadDialogOpen: boolean;
  onUploadDialogOpenChange: (open: boolean) => void;
  onUploadSuccess: () => void;
  previewCitation: Citation | null;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  onOpenDocumentFromCitation: (documentId: string) => void;
}

export function ChatPageDialogs({
  createKbDialogOpen,
  onCreateKbDialogOpenChange,
  messages,
  conversationId,
  selectedKnowledgeBaseId,
  selectedKnowledgeBaseName,
  onKbSwitch,
  uploadDialogOpen,
  onUploadDialogOpenChange,
  onUploadSuccess,
  previewCitation,
  previewOpen,
  onPreviewOpenChange,
  onOpenDocumentFromCitation,
}: ChatPageDialogsProps) {
  const { t } = useTranslation('chat');

  return (
    <>
      <SaveToKBDialog
        open={createKbDialogOpen}
        onOpenChange={onCreateKbDialogOpenChange}
        messages={messages}
        conversationId={conversationId}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        knowledgeBaseName={selectedKnowledgeBaseName}
        onKbSwitch={onKbSwitch}
      />

      <Dialog open={uploadDialogOpen} onOpenChange={onUploadDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('upload.title')}</DialogTitle>
            <DialogDescription>{t('upload.description')}</DialogDescription>
          </DialogHeader>
          <DocumentUpload knowledgeBaseId={selectedKnowledgeBaseId} onSuccess={onUploadSuccess} />
        </DialogContent>
      </Dialog>

      <CitationPreview
        citation={previewCitation}
        open={previewOpen}
        onOpenChange={onPreviewOpenChange}
        onOpenDocument={onOpenDocumentFromCitation}
      />
    </>
  );
}

import { CitationPreview } from '@/components/chat';
import { SaveToKBDialog } from '@/components/chat/SaveToKBDialog';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  selectedKnowledgeBaseId: string | null;
  selectedKnowledgeBaseName?: string;
  onKbSwitch: (kbId: string) => void;
  scopeSwitchDialogOpen: boolean;
  onScopeSwitchDialogOpenChange: (open: boolean) => void;
  pendingScopeName: string;
  onConfirmScopeSwitch: () => void;
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
  scopeSwitchDialogOpen,
  onScopeSwitchDialogOpenChange,
  pendingScopeName,
  onConfirmScopeSwitch,
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
        selectedKnowledgeBaseId={selectedKnowledgeBaseId ?? undefined}
        knowledgeBaseName={selectedKnowledgeBaseName}
        onKbSwitch={onKbSwitch}
      />

      <AlertDialog open={scopeSwitchDialogOpen} onOpenChange={onScopeSwitchDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scope.switchConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('scope.switchConfirm.description', {
                scope: pendingScopeName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('scope.switchConfirm.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={onConfirmScopeSwitch}>
              {t('scope.switchConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={uploadDialogOpen} onOpenChange={onUploadDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('upload.title')}</DialogTitle>
            <DialogDescription>{t('upload.description')}</DialogDescription>
          </DialogHeader>
          <DocumentUpload
            knowledgeBaseId={selectedKnowledgeBaseId ?? undefined}
            onSuccess={onUploadSuccess}
          />
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

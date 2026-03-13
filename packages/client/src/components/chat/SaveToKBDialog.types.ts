import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import type { ChatMessage } from '@/stores/chatPanelStore';

export type KnowledgeSeedSource = 'conversation' | 'latest-assistant';
export type KbSeedMode = 'new' | 'existing';

export interface KnowledgeBaseOption {
  id: string;
  name: string;
}

export interface SaveToKBDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  conversationId: string | null;
  selectedKnowledgeBaseId: string | undefined;
  knowledgeBaseName?: string;
  onKbSwitch: (kbId: string) => void;
}

export interface SaveToKBDialogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBases: KnowledgeBaseOption[];
  kbSeedMode: KbSeedMode;
  onKbSeedModeChange: (mode: KbSeedMode) => void;
  targetKbId: string | null;
  onTargetKbIdChange: (targetKbId: string) => void;
  newKbName: string;
  onNewKbNameChange: (value: string) => void;
  newKbDescription: string;
  onNewKbDescriptionChange: (value: string) => void;
  newKbEmbeddingProvider: EmbeddingProviderType;
  onNewKbEmbeddingProviderChange: (provider: EmbeddingProviderType) => void;
  seedSource: KnowledgeSeedSource;
  onSeedSourceChange: (source: KnowledgeSeedSource) => void;
  hasLatestAssistantMessage: boolean;
  switchToNewKb: boolean;
  onSwitchToNewKbChange: (checked: boolean) => void;
  isCreating: boolean;
  onSave: () => void;
}

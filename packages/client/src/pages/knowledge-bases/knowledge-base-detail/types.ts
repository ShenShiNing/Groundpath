import type { DocumentListItem } from '@knowledge-agent/shared/types';

export type ViewMode = 'grid' | 'table';

export interface DeleteDialogState {
  open: boolean;
  documents: DocumentListItem[];
}

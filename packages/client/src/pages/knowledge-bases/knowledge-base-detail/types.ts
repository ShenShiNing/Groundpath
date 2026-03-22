import type { DocumentListItem } from '@groundpath/shared/types';

export type ViewMode = 'grid' | 'table';

export interface DeleteDialogState {
  open: boolean;
  documents: DocumentListItem[];
}

export type ViewMode = 'read' | 'edit';

export interface SyncDocumentModeInput {
  currentMode: ViewMode;
  isEditable: boolean;
  isContentReady: boolean;
  hasUserSelectedMode: boolean;
}

export function getDefaultDocumentMode(isEditable: boolean): ViewMode {
  return isEditable ? 'edit' : 'read';
}

export function syncDocumentMode({
  currentMode,
  isEditable,
  isContentReady,
  hasUserSelectedMode,
}: SyncDocumentModeInput): ViewMode {
  if (!isEditable && currentMode === 'edit') {
    return 'read';
  }

  if (!isContentReady || hasUserSelectedMode) {
    return currentMode;
  }

  return getDefaultDocumentMode(isEditable);
}

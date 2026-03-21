import { useQuery } from '@tanstack/react-query';
import type {
  DocumentContentResponse,
  DocumentListParams,
  TrashListParams,
  VersionListResponse,
} from '@knowledge-agent/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/query';

const DOCUMENT_LIST_STALE_TIME_MS = 30 * 1000;
const DOCUMENT_DETAIL_STALE_TIME_MS = 60 * 1000;
const DOCUMENT_CONTENT_STALE_TIME_MS = 60 * 1000;
const DOCUMENT_VERSION_STALE_TIME_MS = 60 * 1000;
const TRASH_LIST_STALE_TIME_MS = 30 * 1000;

export function useDocuments(params: Partial<DocumentListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: () => documentsApi.list(params),
    staleTime: DOCUMENT_LIST_STALE_TIME_MS,
  });
}

export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.detail(documentId!),
    queryFn: () => documentsApi.getById(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_DETAIL_STALE_TIME_MS,
  });
}

export function useDocumentContent(documentId: string | undefined) {
  return useQuery<DocumentContentResponse>({
    queryKey: queryKeys.documents.content(documentId!),
    queryFn: () => documentsApi.getContent(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_CONTENT_STALE_TIME_MS,
  });
}

export function useDocumentVersions(documentId: string | undefined) {
  return useQuery<VersionListResponse>({
    queryKey: queryKeys.documents.versions(documentId!),
    queryFn: () => documentsApi.getVersionHistory(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_VERSION_STALE_TIME_MS,
  });
}

export function useTrashDocuments(params: Partial<TrashListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.trash.list(params),
    queryFn: () => documentsApi.listTrash(params),
    staleTime: TRASH_LIST_STALE_TIME_MS,
  });
}

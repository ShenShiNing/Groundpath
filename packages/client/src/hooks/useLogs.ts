import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/api';
import { queryKeys } from '@/lib/query';
import type { StructuredRagDashboardQueryParams } from '@knowledge-agent/shared/schemas';

export function useStructuredRagDashboard(params?: Partial<StructuredRagDashboardQueryParams>) {
  const normalizedParams = {
    hours: params?.hours ?? 24,
    recentLimit: params?.recentLimit ?? 8,
    knowledgeBaseId: params?.knowledgeBaseId,
  };

  return useQuery({
    queryKey: queryKeys.logs.structuredRagSummary(normalizedParams),
    queryFn: () => logsApi.getStructuredRagSummary(normalizedParams),
  });
}

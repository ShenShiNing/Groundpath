import type {
  ApiResponse,
  StructuredRagDashboardSummary,
  StructuredRagLongTermReport,
} from '@groundpath/shared/types';
import type {
  StructuredRagDashboardQueryParams,
  StructuredRagReportQueryParams,
} from '@groundpath/shared/schemas';
import { apiClient, unwrapResponse } from '@/lib/http';

export const logsApi = {
  async getStructuredRagSummary(
    params?: Partial<StructuredRagDashboardQueryParams>
  ): Promise<StructuredRagDashboardSummary> {
    const response = await apiClient.get<ApiResponse<StructuredRagDashboardSummary>>(
      '/api/logs/structured-rag/summary',
      { params }
    );

    return unwrapResponse(response.data);
  },

  async getStructuredRagReport(
    params?: Partial<StructuredRagReportQueryParams>
  ): Promise<StructuredRagLongTermReport> {
    const response = await apiClient.get<ApiResponse<StructuredRagLongTermReport>>(
      '/api/logs/structured-rag/report',
      { params }
    );

    return unwrapResponse(response.data);
  },
};

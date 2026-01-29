import type { ApiResponse, UserPublicInfo, SessionInfo } from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse } from './client';

export const userApi = {
  /** 获取当前用户信息 */
  async me(): Promise<UserPublicInfo> {
    const response = await apiClient.get<ApiResponse<UserPublicInfo>>('/api/auth/me');
    return unwrapResponse(response.data);
  },

  /** 获取当前用户的所有会话 */
  async getSessions(): Promise<SessionInfo[]> {
    const response = await apiClient.get<ApiResponse<SessionInfo[]>>('/api/auth/sessions');
    return unwrapResponse(response.data);
  },

  /** 撤销指定会话 */
  async revokeSession(sessionId: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/auth/sessions/${sessionId}`
    );
    unwrapResponse(response.data);
  },
};

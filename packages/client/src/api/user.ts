import type {
  ApiResponse,
  UserPublicInfo,
  SessionInfo,
  ChangeEmailRequest,
  UpdateProfileRequest,
} from '@groundpath/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';

export const userApi = {
  /** 获取当前用户信息 */
  async me(): Promise<UserPublicInfo> {
    const response = await apiClient.get<ApiResponse<UserPublicInfo>>('/api/v1/auth/me');
    return unwrapResponse(response.data);
  },

  /** 获取当前用户的所有会话 */
  async getSessions(): Promise<SessionInfo[]> {
    const response = await apiClient.get<ApiResponse<SessionInfo[]>>('/api/v1/auth/sessions');
    return unwrapResponse(response.data);
  },

  /** 撤销指定会话 */
  async revokeSession(sessionId: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/v1/auth/sessions/${sessionId}`
    );
    unwrapResponse(response.data);
  },

  /** 更新用户资料 */
  async updateProfile(data: UpdateProfileRequest): Promise<UserPublicInfo> {
    const response = await apiClient.patch<ApiResponse<UserPublicInfo>>(
      '/api/v1/users/profile',
      data
    );
    return unwrapResponse(response.data);
  },

  /** 更新绑定邮箱 */
  async changeEmail(data: ChangeEmailRequest): Promise<UserPublicInfo> {
    const response = await apiClient.patch<ApiResponse<UserPublicInfo>>(
      '/api/v1/users/email',
      data
    );
    return unwrapResponse(response.data);
  },

  /** 上传头像 */
  async uploadAvatar(file: File): Promise<UserPublicInfo> {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await apiClient.post<ApiResponse<UserPublicInfo>>(
      '/api/v1/users/avatar',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return unwrapResponse(response.data);
  },
};

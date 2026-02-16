import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  RegisterWithCodeRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';
import { getDeviceInfo } from '@/lib/device';

export const authApi = {
  /** 登录 */
  async login(data: Omit<LoginRequest, 'deviceInfo'>): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/api/auth/login', {
      ...data,
      deviceInfo: getDeviceInfo(),
    });
    return unwrapResponse(response.data);
  },

  /** 注册 (legacy, without email verification) */
  async register(data: Omit<RegisterRequest, 'deviceInfo'>): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/api/auth/register', {
      ...data,
      deviceInfo: getDeviceInfo(),
    });
    return unwrapResponse(response.data);
  },

  /** 注册 (with verified email) */
  async registerWithCode(data: Omit<RegisterWithCodeRequest, 'deviceInfo'>): Promise<AuthResponse> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/api/auth/register-with-code',
      {
        ...data,
        deviceInfo: getDeviceInfo(),
      }
    );
    return unwrapResponse(response.data);
  },

  /** 重置密码 */
  async resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    const response = await apiClient.post<ApiResponse<ResetPasswordResponse>>(
      '/api/auth/reset-password',
      data
    );
    return unwrapResponse(response.data);
  },

  /** 登出当前设备（refresh token 通过 cookie 自动发送） */
  async logout(): Promise<void> {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/api/auth/logout', {});
    unwrapResponse(response.data);
  },

  /** 登出所有设备 */
  async logoutAll(): Promise<{ revokedSessions: number }> {
    const response =
      await apiClient.post<ApiResponse<{ message: string; revokedSessions: number }>>(
        '/api/auth/logout-all'
      );
    return unwrapResponse(response.data);
  },

  /** 修改密码 */
  async changePassword(data: ChangePasswordRequest): Promise<void> {
    const response = await apiClient.put<ApiResponse<{ message: string }>>(
      '/api/auth/password',
      data
    );
    unwrapResponse(response.data);
  },
};

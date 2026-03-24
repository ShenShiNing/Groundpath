import type {
  ApiResponse,
  SendVerificationCodeRequest,
  SendVerificationCodeResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from '@groundpath/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';

export const emailApi = {
  /** Send verification code */
  async sendCode(data: SendVerificationCodeRequest): Promise<SendVerificationCodeResponse> {
    const response = await apiClient.post<ApiResponse<SendVerificationCodeResponse>>(
      '/api/v1/auth/email/send-code',
      data
    );
    return unwrapResponse(response.data);
  },

  /** Verify code */
  async verifyCode(data: VerifyCodeRequest): Promise<VerifyCodeResponse> {
    const response = await apiClient.post<ApiResponse<VerifyCodeResponse>>(
      '/api/v1/auth/email/verify-code',
      data
    );
    return unwrapResponse(response.data);
  },
};

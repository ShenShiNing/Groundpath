import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  UserPublicInfo,
  RegisterRequest,
  RegisterWithCodeRequest,
} from '@knowledge-agent/shared/types';
import { authApi, setTokenAccessors } from '@/api';
import { logClientError } from '@/lib/logger';

interface AuthState {
  // 状态
  user: UserPublicInfo | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // 操作
  login: (email: string, password: string) => Promise<void>;
  register: (data: Omit<RegisterRequest, 'deviceInfo'>) => Promise<void>;
  registerWithCode: (data: Omit<RegisterWithCodeRequest, 'deviceInfo'>) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setTokens: (tokens: { accessToken: string }) => void;
  setUser: (user: UserPublicInfo) => void;
  clearAuth: () => void;
}

type AuthPersistedState = Pick<AuthState, 'user' | 'isAuthenticated'>;

export const useAuthStore = create<AuthState>()(
  persist<AuthState, [], [], AuthPersistedState>(
    (set, get) => ({
      // 初始状态
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      // 登录
      login: async (email: string, password: string) => {
        set({ isLoading: true });

        try {
          const response = await authApi.login({ email, password });
          set({
            user: response.user,
            accessToken: response.tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          logClientError('authStore.login', error, { email });
          set({ isLoading: false });
          throw error;
        }
      },

      // 注册
      register: async (data: Omit<RegisterRequest, 'deviceInfo'>) => {
        set({ isLoading: true });

        try {
          const response = await authApi.register(data);
          set({
            user: response.user,
            accessToken: response.tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          logClientError('authStore.register', error, { email: data.email });
          set({ isLoading: false });
          throw error;
        }
      },

      // 注册 (with verified email)
      registerWithCode: async (data: Omit<RegisterWithCodeRequest, 'deviceInfo'>) => {
        set({ isLoading: true });

        try {
          const response = await authApi.registerWithCode(data);
          set({
            user: response.user,
            accessToken: response.tokens.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          logClientError('authStore.registerWithCode', error, { email: data.email });
          set({ isLoading: false });
          throw error;
        }
      },

      // 登出当前设备
      logout: async () => {
        const { isAuthenticated } = get();
        set({ isLoading: true });

        try {
          if (isAuthenticated) {
            await authApi.logout();
          }
        } catch (error) {
          logClientError('authStore.logout', error);
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      // 登出所有设备
      logoutAll: async () => {
        set({ isLoading: true });

        try {
          await authApi.logoutAll();
        } catch (error) {
          logClientError('authStore.logoutAll', error);
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      // 设置 token（供 token 刷新和 OAuth 回调使用）
      setTokens: (tokens: { accessToken: string }) => {
        set({
          accessToken: tokens.accessToken,
          isAuthenticated: true,
        });
      },

      // 设置用户信息
      setUser: (user: UserPublicInfo) => {
        set({ user });
      },

      // 清除认证状态
      clearAuth: () => {
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      version: 2,
      migrate: (persistedState): AuthPersistedState => {
        const state = persistedState as Partial<AuthPersistedState> | undefined;
        // Security hardening: ignore legacy persisted accessToken and only keep whitelisted fields.
        return {
          user: state?.user ?? null,
          isAuthenticated: state?.isAuthenticated ?? false,
        };
      },
      // 只持久化必要的认证状态
      partialize: (state): AuthPersistedState => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export function getAccessTokenSnapshot(): string | null {
  return useAuthStore.getState().accessToken;
}

export function isAuthenticatedSnapshot(): boolean {
  return useAuthStore.getState().isAuthenticated;
}

export function clearAuthState(): void {
  useAuthStore.getState().clearAuth();
}

export function getAuthSnapshot(): Pick<AuthState, 'accessToken' | 'isAuthenticated'> {
  const { accessToken, isAuthenticated } = useAuthStore.getState();
  return { accessToken, isAuthenticated };
}

// ============================================================================
// 初始化 Token 访问器
// 在 store 创建后立即设置，确保在任何 API 请求发出之前访问器已就绪
// ============================================================================

setTokenAccessors({
  getAccessToken: getAccessTokenSnapshot,
  isAuthenticated: isAuthenticatedSnapshot,
  onTokenRefreshed: (accessToken) => {
    useAuthStore.setState({ accessToken });
  },
  onAuthError: clearAuthState,
});

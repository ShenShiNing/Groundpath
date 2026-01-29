import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  UserPublicInfo,
  TokenPair,
  RegisterRequest,
  RegisterWithCodeRequest,
} from '@knowledge-agent/shared/types';
import { authApi, setTokenAccessors } from '@/api';

interface AuthState {
  // 状态
  user: UserPublicInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // 操作
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Omit<RegisterRequest, 'deviceInfo'>) => Promise<void>;
  registerWithCode: (data: Omit<RegisterWithCodeRequest, 'deviceInfo'>) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setTokens: (tokens: TokenPair) => void;
  setUser: (user: UserPublicInfo) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      // 在 store 创建后设置 token 访问器，供 api client 使用
      setTimeout(() => {
        setTokenAccessors({
          getAccessToken: () => get().accessToken,
          getRefreshToken: () => get().refreshToken,
          onTokenRefreshed: (tokens) => {
            set({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            });
          },
          onAuthError: () => {
            get().clearAuth();
          },
        });
      }, 0);

      return {
        // 初始状态
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false,

        // 初始化：应用启动时验证 token 有效性
        initialize: async () => {
          const { accessToken, refreshToken, isInitialized } = get();

          if (isInitialized) return;

          if (!accessToken || !refreshToken) {
            set({ isInitialized: true });
            return;
          }

          set({ isLoading: true });

          try {
            // 尝试刷新 token 以验证会话有效性
            const response = await authApi.refresh(refreshToken);
            set({
              user: response.user,
              accessToken: response.tokens.accessToken,
              refreshToken: response.tokens.refreshToken,
              isAuthenticated: true,
              isInitialized: true,
              isLoading: false,
            });
          } catch {
            // Token 无效，清除认证状态
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isInitialized: true,
              isLoading: false,
            });
          }
        },

        // 登录
        login: async (email: string, password: string) => {
          set({ isLoading: true });

          try {
            const response = await authApi.login({ email, password });
            set({
              user: response.user,
              accessToken: response.tokens.accessToken,
              refreshToken: response.tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch (error) {
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
              refreshToken: response.tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch (error) {
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
              refreshToken: response.tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });
          } catch (error) {
            set({ isLoading: false });
            throw error;
          }
        },

        // 登出当前设备
        logout: async () => {
          const { refreshToken } = get();
          set({ isLoading: true });

          try {
            if (refreshToken) {
              await authApi.logout(refreshToken);
            }
          } catch {
            // 忽略登出错误，无论如何都清除本地状态
          } finally {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
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
          } catch {
            // 忽略错误，无论如何都清除本地状态
          } finally {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        },

        // 设置 token（供 token 刷新时使用）
        setTokens: (tokens: TokenPair) => {
          set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
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
            refreshToken: null,
            isAuthenticated: false,
          });
        },
      };
    },
    {
      name: 'auth-storage',
      // 只持久化必要的认证状态
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

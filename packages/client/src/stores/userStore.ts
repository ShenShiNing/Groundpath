import { create } from 'zustand';
import type { SessionInfo, ChangePasswordRequest } from '@knowledge-agent/shared/types';
import { userApi, authApi } from '@/api';

interface UserState {
  // 状态
  sessions: SessionInfo[];
  isLoadingSessions: boolean;
  isChangingPassword: boolean;

  // 操作
  fetchSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  clearSessions: () => void;
}

export const useUserStore = create<UserState>()((set, get) => ({
  // 初始状态
  sessions: [],
  isLoadingSessions: false,
  isChangingPassword: false,

  // 获取所有会话
  fetchSessions: async () => {
    set({ isLoadingSessions: true });

    try {
      const sessions = await userApi.getSessions();
      set({ sessions, isLoadingSessions: false });
    } catch (error) {
      set({ isLoadingSessions: false });
      throw error;
    }
  },

  // 撤销指定会话
  revokeSession: async (sessionId: string) => {
    await userApi.revokeSession(sessionId);
    // 从本地状态中移除该会话
    const { sessions } = get();
    set({ sessions: sessions.filter((s) => s.id !== sessionId) });
  },

  // 修改密码
  changePassword: async (data: ChangePasswordRequest) => {
    set({ isChangingPassword: true });

    try {
      await authApi.changePassword(data);
      set({ isChangingPassword: false });
    } catch (error) {
      set({ isChangingPassword: false });
      throw error;
    }
  },

  // 清除会话列表
  clearSessions: () => {
    set({ sessions: [] });
  },
}));

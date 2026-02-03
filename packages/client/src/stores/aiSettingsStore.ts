import { create } from 'zustand';
import type { LLMProviderType } from '@knowledge-agent/shared/types';

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface AISettingsState {
  // UI 状态
  showApiKey: boolean;
  testStatus: TestStatus;
  testMessage: string;

  // 待提交的凭证（用于在保存前获取模型列表）
  pendingApiKey: string | null;
  pendingBaseUrl: string | null;

  // 操作
  toggleShowApiKey: () => void;
  setTestResult: (status: TestStatus, message: string) => void;
  resetTestStatus: () => void;
  setPendingApiKey: (key: string | null) => void;
  setPendingBaseUrl: (url: string | null) => void;
  resetPendingCredentials: () => void;
  reset: () => void;
}

const initialState = {
  showApiKey: false,
  testStatus: 'idle' as TestStatus,
  testMessage: '',
  pendingApiKey: null,
  pendingBaseUrl: null,
};

export const useAISettingsStore = create<AISettingsState>()((set) => ({
  ...initialState,

  toggleShowApiKey: () => set((s) => ({ showApiKey: !s.showApiKey })),

  setTestResult: (status, message) => set({ testStatus: status, testMessage: message }),

  resetTestStatus: () => set({ testStatus: 'idle', testMessage: '' }),

  setPendingApiKey: (key) => set({ pendingApiKey: key }),

  setPendingBaseUrl: (url) => set({ pendingBaseUrl: url }),

  resetPendingCredentials: () => set({ pendingApiKey: null, pendingBaseUrl: null }),

  reset: () => set(initialState),
}));

/**
 * 判断是否可以获取模型列表
 */
export function canFetchModels(
  provider: LLMProviderType,
  hasExistingKey: boolean,
  pendingApiKey: string | null,
  baseUrl: string,
  pendingBaseUrl: string | null
): boolean {
  // Ollama 不需要凭证
  if (provider === 'ollama') return true;

  const hasKey = !!pendingApiKey || hasExistingKey;

  // Custom provider 需要 API key 和 base URL
  if (provider === 'custom') {
    const hasUrl = !!(pendingBaseUrl ?? baseUrl);
    return hasKey && hasUrl;
  }

  // 其他 provider 只需要 API key
  return hasKey;
}

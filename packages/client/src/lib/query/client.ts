import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (previously cacheTime)
      retry: (failureCount, error) => {
        // 不重试客户端错误 (4xx)
        if (error instanceof AxiosError) {
          const status = error.response?.status;
          if (status && status >= 400 && status < 500) {
            return false;
          }
        }
        // 只对服务端错误 (5xx) 或网络错误重试，最多 3 次
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        // mutations 默认不重试，除非是网络错误
        if (error instanceof AxiosError) {
          // 只对网络错误重试（无响应）
          if (!error.response) {
            return failureCount < 2;
          }
        }
        return false;
      },
    },
  },
});

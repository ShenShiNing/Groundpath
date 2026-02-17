import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type { UserPublicInfo } from '@knowledge-agent/shared/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';

type CallbackStatus = 'processing' | 'success' | 'error';

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);

  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = () => {
      const { accessToken, expiresIn, user, error, returnUrl: r } = search;
      const returnUrl = (r as string) || '/dashboard';

      if (error) {
        setStatus('error');
        setErrorMessage(error as string);
        return;
      }

      if (!accessToken || !user || !expiresIn) {
        setStatus('error');
        setErrorMessage('缺少认证数据');
        return;
      }

      try {
        const parsedUser = (typeof user === 'string' ? JSON.parse(user) : user) as UserPublicInfo;

        setTokens({
          accessToken: accessToken as string,
        });
        setUser(parsedUser);

        setStatus('success');

        setTimeout(() => {
          navigate({ to: returnUrl });
        }, 1000);
      } catch {
        setStatus('error');
        setErrorMessage('认证响应解析失败');
      }
    };

    processCallback();
  }, [search, setTokens, setUser, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md bg-card/85">
        <CardHeader className="text-center">
          {status === 'processing' && (
            <>
              <div className="mb-4 flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>正在处理登录</CardTitle>
              <CardDescription>请稍候，系统正在完成身份验证...</CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mb-4 flex justify-center">
                <CheckCircle className="h-12 w-12 text-emerald-500" />
              </div>
              <CardTitle>登录成功</CardTitle>
              <CardDescription>正在跳转到你的工作区...</CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mb-4 flex justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle>认证失败</CardTitle>
              <CardDescription>{errorMessage || '登录过程中出现异常'}</CardDescription>
            </>
          )}
        </CardHeader>

        {status === 'error' && (
          <CardContent className="flex flex-col gap-3">
            <Button
              className="w-full cursor-pointer"
              onClick={() => navigate({ to: '/auth/login' })}
            >
              返回登录
            </Button>
            <Button
              variant="outline"
              className="w-full cursor-pointer"
              onClick={() => navigate({ to: '/' })}
            >
              返回首页
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default OAuthCallbackPage;

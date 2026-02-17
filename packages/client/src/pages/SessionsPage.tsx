import { Link } from '@tanstack/react-router';
import { ArrowUpRight, MonitorCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/components/sessions';

export function SessionsPage() {
  return (
    <AppLayout>
      <div className="relative flex-1 overflow-y-auto bg-background px-6 py-8 md:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-152 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-4xl space-y-6">
          <section className="rounded-2xl border bg-card/70 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  登录会话
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  管理你的活跃设备与登录历史，可随时撤销不安全会话。
                </p>
              </div>
              <Button variant="outline" className="cursor-pointer" asChild>
                <Link to="/dashboard">
                  返回工作台
                  <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">设备管理</p>
                <p className="mt-2 inline-flex items-center gap-1.5 font-display text-xl font-semibold">
                  <MonitorCheck className="size-4 text-primary" />
                  支持按设备撤销
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">安全提示</p>
                <p className="mt-2 inline-flex items-center gap-1.5 font-display text-xl font-semibold">
                  <ShieldAlert className="size-4 text-primary" />
                  异常会话建议立即下线
                </p>
              </div>
            </div>
          </section>

          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>活跃会话列表</CardTitle>
              <CardDescription>你可以主动终止当前账号在其他设备上的登录状态。</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionList />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

export default SessionsPage;

import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Bot, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { AISettingsForm } from '@/components/settings';

export function AISettingsPage() {
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
                  AI 模型设置
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  配置聊天与文档分析使用的模型与提供商，密钥将被安全存储。
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
                <p className="text-xs text-muted-foreground">配置目标</p>
                <p className="mt-2 inline-flex items-center gap-1.5 font-display text-xl font-semibold">
                  <Bot className="size-4 text-primary" />
                  对话与检索质量
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">建议</p>
                <p className="mt-2 inline-flex items-center gap-1.5 font-display text-xl font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  优先稳定可用模型
                </p>
              </div>
            </div>
          </section>

          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>模型参数</CardTitle>
              <CardDescription>修改后会立即应用到新的问答请求中。</CardDescription>
            </CardHeader>
            <CardContent>
              <AISettingsForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

export default AISettingsPage;

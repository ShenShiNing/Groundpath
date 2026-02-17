import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Database, FileText, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserSummary, QuickLinks } from '@/components/dashboard';
import { useKnowledgeBases } from '@/hooks';
import { useAuthStore } from '@/stores';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: knowledgeBases = [] } = useKnowledgeBases();
  const totalDocuments = knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0);

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
          <section className="rounded-2xl border bg-card/70 p-6 md:p-8">
            <p className="text-sm text-muted-foreground">欢迎回来</p>
            <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {user?.username ? `${user.username} 的工作台` : 'KnowledgeAgent Dashboard'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              在这里统一管理知识库、文档资产与问答质量，保持团队知识可用且持续更新。
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="cursor-pointer" asChild>
                <Link to="/knowledge-bases">
                  打开知识库
                  <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button variant="outline" className="cursor-pointer" asChild>
                <Link to="/settings/ai">配置模型参数</Link>
              </Button>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  知识库总数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="font-display text-3xl font-semibold">{knowledgeBases.length}</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Database className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  文档总量
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="font-display text-3xl font-semibold">{totalDocuments}</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <FileText className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="sm:col-span-2 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  当前状态
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-base font-medium">系统运行正常</p>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Sparkles className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-6">
            <Card>
              <CardContent className="p-6">
                <UserSummary />
              </CardContent>
            </Card>
          </section>

          <section className="mt-6">
            <Card>
              <CardContent className="p-6">
                <QuickLinks />
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

export default DashboardPage;

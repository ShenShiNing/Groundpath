import { Link } from '@tanstack/react-router';
import { ArrowRight, Brain, Database, FileSearch, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';

const principles = [
  {
    title: '可信答案优先',
    description: '每次回答都可回溯到来源文档，降低信息幻觉风险。',
    icon: ShieldCheck,
  },
  {
    title: '知识持续沉淀',
    description: '通过知识库体系管理文档，构建可维护的组织记忆。',
    icon: Database,
  },
  {
    title: '语义检索驱动',
    description: '跨关键词限制定位相关内容，提升查询效率与准确率。',
    icon: FileSearch,
  },
] as const;

export default function AboutPage() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const hasAuthSession = isAuthenticated || !!accessToken;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-176 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="container">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-2xl border bg-background/85 px-4 shadow-sm backdrop-blur-md">
            <Link to={hasAuthSession ? '/dashboard' : '/'} className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Brain className="size-4" />
              </div>
              <span className="font-display text-base font-semibold tracking-tight">
                KnowledgeAgent
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="cursor-pointer" asChild>
                <Link to="/">首页</Link>
              </Button>
              <Button size="sm" className="cursor-pointer" asChild>
                <Link to={hasAuthSession ? '/dashboard' : '/auth/signup'}>
                  {hasAuthSession ? '进入控制台' : '免费开始'}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container pt-36 pb-16 md:pt-44 md:pb-24">
        <section className="mx-auto max-w-5xl">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            关于 KnowledgeAgent
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            KnowledgeAgent
            致力于让企业知识“可检索、可对话、可验证”。我们把文档资产转化为可持续演进的知识系统，帮助团队在日常协作中快速获得准确答案。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button className="cursor-pointer" asChild>
              <Link to={hasAuthSession ? '/dashboard' : '/auth/signup'}>
                {hasAuthSession ? '进入控制台' : '创建账号'}
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="cursor-pointer" asChild>
              <Link to="/knowledge-bases">查看知识库模块</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-3">
          {principles.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-2xl border bg-card/80 p-6">
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

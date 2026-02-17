import { useCallback } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowRight,
  Brain,
  ChevronDown,
  Database,
  FileSearch,
  Files,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/components/theme/theme-provider';
import { useAuthStore } from '@/stores';

const capabilityCards = [
  {
    icon: Files,
    title: '文档统一接入',
    description: '支持 PDF、Markdown、文本等多格式资料接入，集中管理你的文档与笔记。',
  },
  {
    icon: FileSearch,
    title: '语义检索增强',
    description: '不依赖关键词匹配，基于语义相似度定位内容，减少信息遗漏。',
  },
  {
    icon: ShieldCheck,
    title: '可追溯回答',
    description: 'Agent 回答附带来源片段，结果可核验，适合学习、创作与日常使用。',
  },
] as const;

const workflowSteps = [
  { index: '01', title: '创建知识库', description: '按主题创建知识库，让内容结构更清晰。' },
  { index: '02', title: '导入文档', description: '上传后自动向量化，形成可检索上下文。' },
  { index: '03', title: '开始问答', description: '通过 Agent 对话快速获取可引用答案。' },
] as const;

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function HomeUserMenu() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const displayName = user?.username ?? 'User';
  const initials = getUserInitials(user?.username, user?.email);

  const handleLogout = useCallback(async () => {
    await logout();
    await router.navigate({ to: '/' });
  }, [logout, router]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-1.5 rounded-full border bg-card/70 px-1.5 py-1 transition-colors hover:bg-accent/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="打开用户菜单"
        >
          <Avatar size="sm">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to={'/dashboard' as string}>
              <LayoutDashboard className="size-4 mr-2" />
              控制台
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to={'/profile' as string}>
              <User className="size-4 mr-2" />
              个人资料
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to={'/sessions' as string}>
              <Monitor className="size-4 mr-2" />
              会话管理
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onSelect={() => {
            void handleLogout();
          }}
        >
          <LogOut className="size-4 mr-2" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Navbar() {
  const { theme, setTheme } = useTheme();
  const { accessToken, isAuthenticated } = useAuthStore();
  const hasAuthSession = isAuthenticated || !!accessToken;

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="container">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-2xl border bg-background/85 px-4 shadow-sm backdrop-blur-md">
          <Link
            to={hasAuthSession ? '/dashboard' : '/'}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="size-4" />
            </div>
            <span className="font-display text-base font-semibold tracking-tight">
              KnowledgeAgent
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="cursor-pointer"
            >
              <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
              <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
              <span className="sr-only">切换主题</span>
            </Button>

            {hasAuthSession ? (
              <HomeUserMenu />
            ) : (
              <>
                <Button variant="ghost" size="sm" className="cursor-pointer" asChild>
                  <Link to={'/auth/login' as string}>登录</Link>
                </Button>
                <Button size="sm" className="cursor-pointer" asChild>
                  <Link to={'/auth/signup' as string}>免费开始</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const HomePage = () => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const hasAuthSession = isAuthenticated || !!accessToken;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <Navbar />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-80 w-176 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <section className="container pt-36 pb-18 md:pt-44 md:pb-22">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            为个人创作与学习打造可信的 AI 知识助手
          </div>

          <h1 className="font-display mt-6 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
            Knowledge Base Agent
            <span className="text-muted-foreground"> 让你的知识可检索、可对话、可验证</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            统一沉淀你的文档与笔记，通过语义检索和引用式回答，把知识从“难找”变成“即问即得”，
            让学习与创作更高效。
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {hasAuthSession ? (
              <Button size="lg" className="cursor-pointer" asChild>
                <Link to={'/dashboard' as string}>
                  进入控制台
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" className="cursor-pointer" asChild>
                  <Link to={'/auth/signup' as string}>
                    开始构建知识库
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                  <Link to={'/auth/login' as string}>已有账号，立即登录</Link>
                </Button>
              </>
            )}
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">平均检索耗时</p>
              <p className="mt-2 font-display text-2xl font-semibold">&lt; 2s</p>
            </div>
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">支持文档类型</p>
              <p className="mt-2 font-display text-2xl font-semibold">PDF / MD / TXT</p>
            </div>
            <div className="rounded-xl border bg-card/70 p-4">
              <p className="text-xs text-muted-foreground">答案输出方式</p>
              <p className="mt-2 font-display text-2xl font-semibold">带引用来源</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Core Capabilities
              </p>
              <h2 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">
                为个人创作者与小团队设计
              </h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {capabilityCards.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border bg-card/80 p-6 transition-colors duration-200 hover:bg-accent/40"
              >
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-10 md:py-14">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-card/60 p-6 sm:p-8 md:p-10">
          <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-4" />3 步完成你的知识库 Agent
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {workflowSteps.map((step) => (
              <div key={step.index} className="space-y-3">
                <p className="font-display text-xl font-bold text-primary">{step.index}</p>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container pt-8 pb-18 md:pb-24">
        <div className="mx-auto max-w-4xl rounded-3xl border bg-card p-8 text-center sm:p-10">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            准备好搭建你的专属知识助手了吗？
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            从文档整理到可引用问答，在一个界面内完成你的知识沉淀与使用闭环。
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="cursor-pointer" asChild>
              <Link to={hasAuthSession ? ('/dashboard' as string) : ('/auth/signup' as string)}>
                {hasAuthSession ? '进入控制台' : '免费创建账号'}
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="cursor-pointer" asChild>
              <Link to={'/about' as string}>了解产品详情</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} KnowledgeAgent</p>
            <div className="flex items-center gap-5">
              <Link
                to="/about"
                className="cursor-pointer transition-colors duration-200 hover:text-foreground"
              >
                About
              </Link>
              <Link
                to={hasAuthSession ? ('/dashboard' as string) : ('/auth/login' as string)}
                className="cursor-pointer transition-colors duration-200 hover:text-foreground"
              >
                Console
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

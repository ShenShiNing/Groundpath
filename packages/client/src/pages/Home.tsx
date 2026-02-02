import { Link } from '@tanstack/react-router';
import { Brain, Search, MessageSquare, FileText, ArrowRight, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme/theme-provider';
import { useAuthStore } from '@/stores';

// ============================================================================
// Navbar
// ============================================================================

function Navbar() {
  const { theme, setTheme } = useTheme();
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="container flex h-14 items-center justify-between">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="size-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">KnowledgeAgent</span>
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
            <span className="sr-only">Toggle theme</span>
          </Button>

          {isAuthenticated ? (
            <Button size="sm" asChild>
              <Link to={'/dashboard' as string}>Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to={'/auth/login' as string}>Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to={'/auth/signup' as string}>Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Feature Card
// ============================================================================

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent/50">
      <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

// ============================================================================
// Home Page
// ============================================================================

const HomePage = () => {
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="container pt-32 pb-20 md:pt-44 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
            </span>
            Beta
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            AI Knowledge Base
          </h1>
          <h2 className="mt-3 text-xl font-medium text-muted-foreground sm:text-2xl md:text-3xl">
            for Your Team
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload documents, build knowledge bases, and get AI-powered answers with accurate source
            citations.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {isAuthenticated ? (
              <Button size="lg" className="cursor-pointer" asChild>
                <Link to={'/dashboard' as string}>
                  Go to Dashboard
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" className="cursor-pointer" asChild>
                  <Link to={'/auth/signup' as string}>
                    Start for Free
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="cursor-pointer" asChild>
                  <Link to={'/auth/login' as string}>Log in</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container pb-20 md:pb-28">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={FileText}
            title="Document Intelligence"
            description="Upload PDFs, Markdown, and text files. Documents are automatically chunked and embedded for semantic search."
          />
          <FeatureCard
            icon={Search}
            title="Semantic Search"
            description="Find information by meaning, not just keywords. Vector-based retrieval delivers accurate, contextual results."
          />
          <FeatureCard
            icon={MessageSquare}
            title="AI Chat with Citations"
            description="Ask questions and get answers grounded in your documents, with source citations you can verify."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t">
        <div className="container py-20 md:py-28">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to get started?</h2>
            <p className="mt-3 text-muted-foreground">
              Create your first knowledge base and start asking questions.
            </p>
            <div className="mt-8">
              <Button size="lg" className="cursor-pointer" asChild>
                <Link to={isAuthenticated ? ('/dashboard' as string) : ('/auth/signup' as string)}>
                  {isAuthenticated ? 'Go to Dashboard' : 'Create Free Account'}
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex h-14 items-center justify-between text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} KnowledgeAgent</span>
          <div className="flex items-center gap-4">
            <Link to="/" className="transition-colors hover:text-foreground">
              About
            </Link>
            <Link to="/" className="transition-colors hover:text-foreground">
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;

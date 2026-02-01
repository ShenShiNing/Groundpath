import { Link } from '@tanstack/react-router';
import { Brain, Database, ShieldCheck, Code, ArrowRight, Zap, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';

const HomePage = () => {
  return (
    <AppLayout showSidebar={false}>
      {/* Hero Section */}
      <section className="container py-24 md:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-8 inline-flex items-center rounded-full border px-3 py-1 text-sm">
            <span className="relative flex size-2 mr-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-primary"></span>
            </span>
            Beta Now Available
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            The Intelligence Layer for Your{' '}
            <span className="text-primary">Enterprise Knowledge</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Ingest, index, and retrieve proprietary data with sub-second latency. The
            enterprise-ready RAG pipeline built for scale and security.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild>
              <Link to={'/auth/signup' as string}>
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline">
              View Demo
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Trusted by 2,000+ developers</p>
        </div>
      </section>

      {/* Features Section */}
      <section className="container border-t py-24 md:py-32">
        <div className="mx-auto mb-16 max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to build production RAG
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A complete toolkit for building enterprise-grade knowledge retrieval systems without the
            infrastructure headache.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Brain className="size-6" />
              </div>
              <CardTitle>Neural Search</CardTitle>
              <CardDescription>
                Vector-based semantic retrieval that understands context, not just keywords. Uses
                hybrid search for maximum accuracy.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Database className="size-6" />
              </div>
              <CardTitle>Automated Indexing</CardTitle>
              <CardDescription>
                Connect Notion, Jira, Slack, and Google Drive in seconds. Our pipeline handles
                chunking, embedding, and syncing automatically.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <CardTitle>Secure RAG</CardTitle>
              <CardDescription>
                SOC2 Type II compliant data handling. Role-based access control (RBAC) allows you to
                restrict knowledge access at the document level.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-3">
            <CardHeader className="flex-row items-start gap-4">
              <div className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Code className="size-6" />
              </div>
              <div className="flex-1">
                <CardTitle>Developer-First API</CardTitle>
                <CardDescription className="mt-2">
                  Built by engineers, for engineers. Our SDK provides type-safe interfaces,
                  comprehensive error handling, and detailed telemetry for every request.
                </CardDescription>
                <Button variant="link" className="mt-4 px-0" asChild>
                  <Link to="/">
                    Read the documentation
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="container border-t py-24 md:py-32">
        <div className="mx-auto mb-16 max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three simple steps to intelligent knowledge retrieval.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="text-2xl font-bold">1</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold">Connect Your Data</h3>
            <p className="text-sm text-muted-foreground">
              Integrate your existing data sources with our pre-built connectors or custom API.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="text-2xl font-bold">2</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold">Auto-Index & Embed</h3>
            <p className="text-sm text-muted-foreground">
              We automatically chunk, embed, and index your documents using state-of-the-art models.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="text-2xl font-bold">3</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold">Query & Retrieve</h3>
            <p className="text-sm text-muted-foreground">
              Use our API to perform semantic searches and power your AI applications.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container border-t py-24 md:py-32">
        <div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="text-4xl font-bold text-primary">99.9%</div>
            <p className="mt-2 text-sm text-muted-foreground">Uptime SLA</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary">&lt;50ms</div>
            <p className="mt-2 text-sm text-muted-foreground">Average Latency</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary">10M+</div>
            <p className="mt-2 text-sm text-muted-foreground">Vectors Processed</p>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary">2,000+</div>
            <p className="mt-2 text-sm text-muted-foreground">Active Developers</p>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="container border-t py-24 md:py-32">
        <div className="mx-auto mb-16 max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why choose KnowledgeAgent?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built for production workloads from day one.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
          <div className="flex gap-4 rounded-lg border p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground">
                Sub-50ms query latency with our optimized vector database infrastructure.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-lg border p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="size-5" />
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Global Scale</h3>
              <p className="text-sm text-muted-foreground">
                Multi-region deployment with automatic failover and data replication.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-lg border p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lock className="size-5" />
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Enterprise Security</h3>
              <p className="text-sm text-muted-foreground">
                SOC2 Type II certified with end-to-end encryption and RBAC.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-lg border p-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Code className="size-5" />
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Developer Experience</h3>
              <p className="text-sm text-muted-foreground">
                Type-safe SDKs, comprehensive docs, and responsive support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container border-t py-24 md:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to upgrade your knowledge stack?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start building intelligent applications today. Free for up to 10k vectors.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild>
              <Link to={'/auth/signup' as string}>Start Building Now</Link>
            </Button>
            <Button size="lg" variant="outline">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>
    </AppLayout>
  );
};

export default HomePage;

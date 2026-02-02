import { Link } from '@tanstack/react-router';
import { Brain } from 'lucide-react';
import { useAuthStore } from '@/stores';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footer: React.ReactNode;
}

function AuthHeader() {
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="container flex h-14 items-center justify-center">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="size-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">KnowledgeAgent</span>
        </Link>
      </div>
    </header>
  );
}

export function AuthPageLayout({ children, title, description, footer }: AuthPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <AuthHeader />

      <div className="min-h-screen flex flex-col items-center justify-center px-4 pt-14">
        <div className="w-full max-w-md py-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-2 mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {/* Form */}
          {children}

          {/* Footer */}
          {footer}
        </div>
      </div>
    </div>
  );
}

interface AuthFooterLinkProps {
  text: string;
  linkText: string;
  linkTo: string;
}

export function AuthFooterLink({ text, linkText, linkTo }: AuthFooterLinkProps) {
  return (
    <p className="text-center text-sm text-muted-foreground mt-6">
      {text}{' '}
      <Link to={linkTo} className="font-semibold hover:underline underline-offset-4">
        {linkText}
      </Link>
    </p>
  );
}

import { Link } from '@tanstack/react-router';
import { AppLayout } from '@/components/layout/AppLayout';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footer: React.ReactNode;
}

function AuthLogo() {
  return (
    <div className="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-1 ring-primary/10">
      <svg
        className="w-6 h-6"
        fill="none"
        height="24"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 17L12 22L22 17"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" fill="currentColor" r="2" />
      </svg>
    </div>
  );
}

export function AuthPageLayout({ children, title, description, footer }: AuthPageLayoutProps) {
  return (
    <AppLayout showFooter="simple">
      <div className="min-h-[calc(100vh-4rem-5rem)] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <AuthLogo />
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Form */}
          {children}

          {/* Footer */}
          {footer}
        </div>
      </div>
    </AppLayout>
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

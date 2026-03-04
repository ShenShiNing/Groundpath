import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryBaseProps {
  children: ReactNode;
  fallback?: ReactNode;
  title: string;
  defaultMessage: string;
  retryLabel: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryBase extends Component<ErrorBoundaryBaseProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryBaseProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-100 flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertCircle className="size-10 text-destructive" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{this.props.title}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {this.state.error?.message ?? this.props.defaultMessage}
            </p>
          </div>
          <Button variant="outline" onClick={this.handleReset}>
            <RefreshCw className="mr-2 size-4" />
            {this.props.retryLabel}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const { t } = useTranslation('errors');

  return (
    <ErrorBoundaryBase
      fallback={fallback}
      title={t('boundary.title')}
      defaultMessage={t('boundary.defaultMessage')}
      retryLabel={t('boundary.retry')}
    >
      {children}
    </ErrorBoundaryBase>
  );
}

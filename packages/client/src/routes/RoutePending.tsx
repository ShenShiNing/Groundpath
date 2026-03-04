import { Loader2 } from 'lucide-react';

export function RoutePending() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

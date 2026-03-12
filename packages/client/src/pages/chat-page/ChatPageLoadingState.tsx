import { Skeleton } from '@/components/ui/skeleton';

export function ChatPageLoadingState() {
  return (
    <div className="flex-1 overflow-hidden bg-background px-6 py-8">
      <div className="flex h-full flex-col gap-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-112 rounded-2xl" />
      </div>
    </div>
  );
}

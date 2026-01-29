import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { SessionInfo } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DeviceIcon } from './DeviceIcon';

interface SessionCardProps {
  session: SessionInfo;
  onRevoke: (sessionId: string) => Promise<void>;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString();
}

export function SessionCard({ session, onRevoke }: SessionCardProps) {
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      await onRevoke(session.id);
    } finally {
      setIsRevoking(false);
    }
  };

  const deviceInfo = session.deviceInfo;
  const browserInfo = [deviceInfo?.browser, deviceInfo?.os].filter(Boolean).join(' on ');

  return (
    <Card className={cn(session.isCurrent && 'border-primary')}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <DeviceIcon deviceType={deviceInfo?.deviceType} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{browserInfo || 'Unknown device'}</p>
            {session.isCurrent && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                Current
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {session.ipAddress && <span>IP: {session.ipAddress}</span>}
            <span>Last active: {formatDate(session.lastUsedAt)}</span>
            <span>Created: {formatDate(session.createdAt)}</span>
          </div>
        </div>
        {!session.isCurrent && (
          <Button variant="outline" size="sm" onClick={handleRevoke} disabled={isRevoking}>
            {isRevoking ? <Loader2 className="size-4 animate-spin" /> : 'Revoke'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

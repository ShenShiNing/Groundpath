import { useEffect, useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUserStore, useAuthStore } from '@/stores';
import { SessionCard } from './SessionCard';

export function SessionList() {
  const { sessions, isLoadingSessions, fetchSessions, revokeSession } = useUserStore();
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  useEffect(() => {
    fetchSessions().catch(() => {
      toast.error('Failed to load sessions');
    });
  }, [fetchSessions]);

  const handleRevoke = async (sessionId: string) => {
    try {
      await revokeSession(sessionId);
      toast.success('Session revoked');
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAll = async () => {
    setIsRevokingAll(true);
    try {
      await logoutAll();
      toast.success('All other sessions have been logged out');
    } catch {
      toast.error('Failed to log out other sessions');
    } finally {
      setIsRevokingAll(false);
    }
  };

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onRevoke={handleRevoke} />
        ))}
      </div>

      {sessions.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No active sessions found</p>
      )}

      {otherSessions.length > 0 && (
        <Button
          variant="destructive"
          onClick={handleRevokeAll}
          disabled={isRevokingAll}
          className="w-full"
        >
          {isRevokingAll ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 size-4" />
          )}
          Log out all other devices
        </Button>
      )}
    </div>
  );
}

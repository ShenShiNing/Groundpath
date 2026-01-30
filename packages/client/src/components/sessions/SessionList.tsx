import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';
import { userApi } from '@/api';
import { queryKeys } from '@/lib/queryClient';
import { SessionCard } from './SessionCard';

export function SessionList() {
  const queryClient = useQueryClient();
  const logoutAll = useAuthStore((s) => s.logoutAll);
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  const {
    data: sessions = [],
    isLoading: isLoadingSessions,
    error,
  } = useQuery({
    queryKey: queryKeys.user.sessions,
    queryFn: userApi.getSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: userApi.revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.sessions });
    },
  });

  if (error) {
    toast.error('Failed to load sessions');
  }

  const handleRevoke = async (sessionId: string) => {
    try {
      await revokeMutation.mutateAsync(sessionId);
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

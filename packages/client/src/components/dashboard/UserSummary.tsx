import { Link } from '@tanstack/react-router';
import { Calendar } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { formatDate } from '@/lib/date';

export function UserSummary() {
  const { t } = useTranslation('dashboard');
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  const userInitials = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col items-center text-center sm:flex-row sm:text-left gap-6">
      <Avatar className="size-20">
        <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
        <AvatarFallback className="text-2xl">{userInitials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div>
          <h2 className="text-2xl font-bold">{user.username}</h2>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        {user.bio && <p className="text-sm">{user.bio}</p>}
        <div className="flex items-center justify-center sm:justify-start gap-1 text-xs text-muted-foreground">
          <Calendar className="size-3" />
          <span>{t('userSummary.joined', { date: formatDate(user.createdAt) })}</span>
        </div>
      </div>
      <Button variant="outline" asChild>
        <Link to="/profile">{t('userSummary.editProfile')}</Link>
      </Button>
    </div>
  );
}
